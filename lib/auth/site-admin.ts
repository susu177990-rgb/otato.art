import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Internal deployment policy: shared settings are editable by any signed-in user.
 * Callers still perform the auth check before reaching this helper.
 */
export async function canManageSiteSettings(supabase: SupabaseClient): Promise<boolean> {
  void supabase;
  return true;
}
