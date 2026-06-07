import { NextResponse } from "next/server";
import { changeEmail } from "@/lib/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UpdateEmailInput } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<UpdateEmailInput>;
    const result = await changeEmail(supabase, user, {
      newEmail: String(body.newEmail ?? ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/me/email POST]", error);
    const message = error instanceof Error ? error.message : "修改邮箱失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
