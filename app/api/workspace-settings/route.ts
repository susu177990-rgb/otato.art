import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getWorkspaceSnapshot,
  upsertWorkspaceSnapshot,
} from "@/lib/db/workspace-settings-store";
import { canManageSiteSettings } from "@/lib/auth/site-admin";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const snapshot = await getWorkspaceSnapshot(supabase);
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[workspace-settings GET]", e);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    if (!(await canManageSiteSettings(supabase))) {
      return NextResponse.json({ error: "只有管理员可以修改全站配置" }, { status: 403 });
    }

    const body = (await req.json()) as { llm?: unknown; imageWorkspace?: unknown; videoWorkspace?: unknown };
    const snapshot = await upsertWorkspaceSnapshot(supabase, {
      llm: body.llm as Parameters<typeof upsertWorkspaceSnapshot>[1]["llm"],
      imageWorkspace: body.imageWorkspace,
      videoWorkspace: body.videoWorkspace,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    console.error("[workspace-settings POST]", e);
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }
}
