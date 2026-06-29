import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ProjectAssetValidationError,
  parseProjectAssetInput,
} from "@/lib/project-assets/validation";
import {
  getProjectImageGalleryRecord,
  insertProjectAsset,
  listProjectAssets,
  projectExists,
} from "@/lib/project-assets/store";
import {
  copyProjectAssetMedia,
  projectAssetStoragePath,
  removeProjectAssetMedia,
} from "@/lib/project-assets/storage";
import {
  mediaFileExtensionFromMime,
  putMediaObject,
} from "@/lib/media-storage";

type RouteContext = { params: Promise<{ id: string }> };

const PROJECT_ASSET_MEDIA_MIME_RE = /^(?:image\/(?:png|jpe?g|webp|gif|bmp|avif)|video\/(?:mp4|webm|quicktime|x-m4v|ogg))$/i;
const PROJECT_ASSET_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const PROJECT_ASSET_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
const PROJECT_ASSET_VIDEO_MIME_RE = /^video\//i;

function errorResponse(error: unknown, operation: string): Response {
  if (error instanceof ProjectAssetValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error(`[project assets ${operation}]`, error);
  return Response.json({ error: `${operation}_failed` }, { status: 500 });
}

async function authenticatedProject(ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: Response.json({ error: "请先登录" }, { status: 401 }) };
  const { id: projectId } = await ctx.params;
  if (!(await projectExists(supabase, projectId))) {
    return { response: Response.json({ error: "项目不存在" }, { status: 404 }) };
  }
  return { supabase, user, projectId };
}

function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function formTags(form: FormData): string[] {
  const raw = formText(form, "tags").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item ?? "")) : [];
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function extensionFromFile(file: Blob): string {
  const mimeExt = mediaFileExtensionFromMime(file.type || "", "");
  if (mimeExt) return mimeExt;
  const name = "name" in file && typeof file.name === "string" ? file.name : "";
  return name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
}

async function createAssetFromMultipart(request: NextRequest, ctx: RouteContext): Promise<Response> {
  let cleanup:
    | {
        supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
        userId: string;
        projectId: string;
        assetId: string;
      }
    | undefined;
  try {
    const auth = await authenticatedProject(ctx);
    if ("response" in auth) return auth.response ?? Response.json({ error: "请先登录" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "缺少素材文件" }, { status: 400 });
    }
    const contentType = file.type || "application/octet-stream";
    if (!PROJECT_ASSET_MEDIA_MIME_RE.test(contentType)) {
      return Response.json({ error: "素材只支持图片或 MP4、WebM、MOV 视频" }, { status: 400 });
    }
    const limit = PROJECT_ASSET_VIDEO_MIME_RE.test(contentType)
      ? PROJECT_ASSET_VIDEO_MAX_BYTES
      : PROJECT_ASSET_IMAGE_MAX_BYTES;
    if (file.size <= 0) {
      return Response.json({ error: "素材文件为空" }, { status: 400 });
    }
    if (file.size > limit) {
      return Response.json({ error: `单个素材不能超过 ${Math.floor(limit / 1024 / 1024)}MB` }, { status: 400 });
    }

    const assetId = nanoid(12);
    cleanup = {
      supabase: auth.supabase,
      userId: auth.user.id,
      projectId: auth.projectId,
      assetId,
    };
    const key = projectAssetStoragePath({
      userId: auth.user.id,
      projectId: auth.projectId,
      assetId,
      slot: "primary",
      extension: extensionFromFile(file),
    });
    const primaryImageUrl = await putMediaObject({
      key,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType,
    });
    const value = parseProjectAssetInput({
      type: formText(form, "type"),
      name: formText(form, "name"),
      description: formText(form, "description"),
      tags: formTags(form),
      primaryImageUrl,
      referenceImageUrls: [],
    });
    const asset = await insertProjectAsset(auth.supabase, {
      id: assetId,
      userId: auth.user.id,
      projectId: auth.projectId,
      value,
    });
    cleanup = undefined;
    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    if (cleanup) {
      await removeProjectAssetMedia(cleanup.supabase, cleanup).catch((cleanupError) => {
        console.warn("[project assets multipart cleanup]", cleanupError);
      });
    }
    return errorResponse(error, "create");
  }
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const auth = await authenticatedProject(ctx);
    if ("response" in auth) return auth.response;
    const assets = await listProjectAssets(auth.supabase, auth.projectId);
    return Response.json({ assets });
  } catch (error) {
    return errorResponse(error, "read");
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return createAssetFromMultipart(request, ctx);
  }

  let cleanup:
    | {
        supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
        userId: string;
        projectId: string;
        assetId: string;
      }
    | undefined;
  try {
    const auth = await authenticatedProject(ctx);
    if ("response" in auth) return auth.response;
    const body = (await request.json()) as Record<string, unknown>;
    let value = parseProjectAssetInput(body);

    if (typeof body.sourceGalleryRecordId === "string" && body.sourceGalleryRecordId.trim()) {
      const source = await getProjectImageGalleryRecord(
        auth.supabase,
        auth.projectId,
        body.sourceGalleryRecordId.trim(),
      );
      if (!source || source.status !== "success" || !source.imageUrl?.trim()) {
        return Response.json({ error: "画廊图片不存在或不可转存" }, { status: 404 });
      }
      value = {
        ...value,
        primaryImageUrl: source.imageUrl,
      };
    }

    const assetId = nanoid(12);
    cleanup = {
      supabase: auth.supabase,
      userId: auth.user.id,
      projectId: auth.projectId,
      assetId,
    };
    const media = await copyProjectAssetMedia(auth.supabase, {
      ...cleanup,
      primaryImageUrl: value.primaryImageUrl,
      referenceImageUrls: value.referenceImageUrls ?? [],
    });
    const asset = await insertProjectAsset(auth.supabase, {
      id: assetId,
      userId: auth.user.id,
      projectId: auth.projectId,
      value: { ...value, ...media },
    });
    cleanup = undefined;
    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    if (cleanup) {
      await removeProjectAssetMedia(cleanup.supabase, cleanup).catch((cleanupError) => {
        console.warn("[project assets create cleanup]", cleanupError);
      });
    }
    return errorResponse(error, "create");
  }
}
