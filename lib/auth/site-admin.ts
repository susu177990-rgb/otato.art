import type { SupabaseClient } from "@supabase/supabase-js";

export const SITE_ADMIN_EMAIL = "1779916397@qq.com";

export async function canManageSiteSettings(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email?.trim().toLowerCase() === SITE_ADMIN_EMAIL;
}
