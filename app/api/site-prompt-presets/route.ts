import { NextResponse } from "next/server";
import { canManageSiteSettings } from "@/lib/auth/site-admin";
import { formatDbError } from "@/lib/db/format-db-error";
import {
  listSitePromptPresetsByKindForUser,
  replaceSitePromptPresetsByKind,
  type PromptPresetKind,
  type SitePromptPreset,
} from "@/lib/db/prompt-preset-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeKind(raw: string | null): PromptPresetKind | null {
  if (raw === "image" || raw === "video" || raw === "chat") return raw;
  return null;
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
