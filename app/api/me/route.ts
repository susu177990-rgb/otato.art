import { NextResponse } from "next/server";
import { getMeSnapshot } from "@/lib/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const snapshot = await getMeSnapshot(supabase, user);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[api/me GET]", error);
    const message = error instanceof Error ? error.message : "读取账号信息失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
