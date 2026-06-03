import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getWorkspaceSnapshot,
  upsertWorkspaceSnapshot,
} from "@/lib/db/workspace-settings-store";

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

    const body = (await req.json()) as { llm?: unknown; imageWorkspace?: unknown; videoWorkspace?: unknown };
    // 全站配置是共享单例，但当前产品约定允许任意已登录账号通过受控接口修改。
    const snapshot = await upsertWorkspaceSnapshot(createSupabaseAdminClient(), {
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
