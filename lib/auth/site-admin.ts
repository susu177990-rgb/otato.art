import type { SupabaseClient } from "@supabase/supabase-js";
import { canAdmin, type AdminPermission } from "@/lib/admin/types";
import { getAdminActor } from "@/lib/admin/user-management";

export const SITE_ADMIN_EMAIL = "1779916397@qq.com";

export async function canManageSiteSettings(
  supabase: SupabaseClient,
  permission: AdminPermission = "manageSystem",
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const actor = await getAdminActor(supabase, user);
  return actor ? canAdmin(actor.role, permission) : false;
}
