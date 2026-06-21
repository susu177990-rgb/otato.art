import { NextResponse } from "next/server";
import type { AdminPermission } from "@/lib/admin/types";
import { canAdmin } from "@/lib/admin/types";
import { getAdminActor } from "@/lib/admin/user-management";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin(permission: AdminPermission = "review") {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  }
  const actor = await getAdminActor(supabase, user);
  if (!actor || !canAdmin(actor.role, permission)) {
    return { error: NextResponse.json({ error: "当前账号无权访问全局管理" }, { status: 403 }) };
  }
  return { supabase, user, actor };
}
