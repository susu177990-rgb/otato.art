import { NextResponse } from "next/server";
import { changePassword } from "@/lib/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UpdatePasswordInput } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<UpdatePasswordInput>;
    const result = await changePassword(supabase, user, {
      currentPassword: String(body.currentPassword ?? ""),
      newPassword: String(body.newPassword ?? ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/me/password POST]", error);
    const message = error instanceof Error ? error.message : "修改密码失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
