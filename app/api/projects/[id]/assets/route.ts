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
  removeProjectAssetMedia,
} from "@/lib/project-assets/storage";

type RouteContext = { params: Promise<{ id: string }> };

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
