import { NextResponse } from "next/server";
import { canManageSiteSettings } from "@/lib/auth/site-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  }
  if (!(await canManageSiteSettings(supabase))) {
    return { error: NextResponse.json({ error: "当前账号无权访问全局管理" }, { status: 403 }) };
  }
  return { supabase, user };
}
