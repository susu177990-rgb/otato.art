import { NextResponse } from "next/server";
import { canManageSiteSettings } from "@/lib/auth/site-admin";
import { formatDbError } from "@/lib/db/format-db-error";
import {
  listSitePromptPresetsByKindForUser,
  newUserPromptPresetId,
  replaceSitePromptPresetsByKind,
  upsertSitePromptPreset,
  type PromptPresetKind,
  type SitePromptPreset,
} from "@/lib/db/prompt-preset-store";
import { uploadModeCoverObject } from "@/lib/db/persist-mode-cover-image";
import {
  assertModeCoverInput,
  MODE_COVER_INPUT_MAX_BYTES,
  prepareModeCoverThumbnail,
} from "@/lib/image/process-mode-cover";
import { normalizePromptTags } from "@/lib/prompt-tags";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeKind(raw: string | null): PromptPresetKind | null {
  if (raw === "image" || raw === "video" || raw === "chat") return raw;
  return null;
}

async function readCreatePresetPayload(req: Request): Promise<{
  kind: PromptPresetKind | null;
  title: string;
  promptTemplate: string;
  description: string;
  tags: string[];
  coverFile: Blob | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("coverFile");
    return {
      kind: normalizeKind(String(form.get("kind") ?? "")),
      title: String(form.get("title") ?? "").trim(),
      promptTemplate: String(form.get("promptTemplate") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      tags: normalizePromptTags(String(form.get("tags") ?? "").split(",")).filter((tag) => tag.trim()),
      coverFile: file instanceof Blob && file.size > 0 ? file : null,
    };
  }

  const body = (await req.json()) as {
    kind?: unknown;
    title?: unknown;
    promptTemplate?: unknown;
    tags?: unknown;
    description?: unknown;
  };
  return {
    kind: normalizeKind(typeof body.kind === "string" ? body.kind : null),
    title: typeof body.title === "string" ? body.title.trim() : "",
    promptTemplate: typeof body.promptTemplate === "string" ? body.promptTemplate.trim() : "",
    description: typeof body.description === "string" ? body.description.trim() : "",
    tags: normalizePromptTags(body.tags),
    coverFile: null,
  };
}

async function uploadPromptPresetCover(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, presetId: string, file: Blob): Promise<string> {
  if (file.size > MODE_COVER_INPUT_MAX_BYTES) {
    throw new Error(`封面图不能超过 ${Math.round(MODE_COVER_INPUT_MAX_BYTES / (1024 * 1024))}MB`);
  }
  const contentType = (file.type || "image/png").split(";")[0]?.trim() || "image/png";
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  assertModeCoverInput(contentType, rawBytes.byteLength);
  const webpBytes = await prepareModeCoverThumbnail(rawBytes);
  return uploadModeCoverObject(supabase, `prompt-${presetId}`, webpBytes);
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const kind = normalizeKind(new URL(req.url).searchParams.get("kind"));
    if (!kind) return NextResponse.json({ error: "kind 必须是 image / video / chat" }, { status: 400 });

    const presets = await listSitePromptPresetsByKindForUser(supabase, kind, user.id);
    return NextResponse.json({
      presets,
      debugUserId: process.env.NODE_ENV !== "production" ? user.id : undefined,
      debugUserEmail: process.env.NODE_ENV !== "production" ? user.email ?? null : undefined,
    });
  } catch (e) {
    console.error("[site-prompt-presets GET]", e);
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!(await canManageSiteSettings(supabase))) {
      return NextResponse.json({ error: "当前账号无权修改全站预设库" }, { status: 403 });
    }

    const body = (await req.json()) as {
      kind?: PromptPresetKind;
      presets?: SitePromptPreset[];
    };
    const kind = body.kind;
    if (kind !== "image" && kind !== "video" && kind !== "chat") {
      return NextResponse.json({ error: "kind 必须是 image / video / chat" }, { status: 400 });
    }

    await replaceSitePromptPresetsByKind(supabase, kind, Array.isArray(body.presets) ? body.presets : []);
    const presets = await listSitePromptPresetsByKindForUser(supabase, kind, user.id);
    return NextResponse.json({ presets });
  } catch (e) {
    console.error("[site-prompt-presets PUT]", e);
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const payload = await readCreatePresetPayload(req);
    const kind = payload.kind;
    if (!kind) return NextResponse.json({ error: "kind 必须是 image / video / chat" }, { status: 400 });

    const title = payload.title;
    if (!title) return NextResponse.json({ error: "请填写预设标题" }, { status: 400 });

    const promptTemplate = payload.promptTemplate;
    if (!promptTemplate) return NextResponse.json({ error: "请填写提示词内容" }, { status: 400 });

    const writeClient = maybeCreateSupabaseAdminClient() ?? supabase;
    const id = newUserPromptPresetId(kind);
    const coverImageUrl = payload.coverFile ? await uploadPromptPresetCover(writeClient, id, payload.coverFile) : "";

    const preset: SitePromptPreset = {
      id,
      kind,
      title,
      promptTemplate,
      coverImageUrl,
      refSlotHints: [],
      tags: payload.tags,
      description: payload.description || undefined,
    };

    const savedPreset = await upsertSitePromptPreset(writeClient, kind, preset);
    const presets = await listSitePromptPresetsByKindForUser(supabase, kind, user.id);
    return NextResponse.json({ preset: { ...savedPreset, isFavorite: false }, presets });
  } catch (e) {
    console.error("[site-prompt-presets POST]", e);
    return NextResponse.json({ error: formatDbError(e) }, { status: 500 });
  }
}
