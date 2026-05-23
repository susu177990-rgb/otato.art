import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingAdminRpc(e: unknown): boolean {
  const message =
    e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : String(e);
  const code =
    e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : "";
  return code === "PGRST202" || /is_site_admin|schema cache|Could not find/i.test(message);
}

export async function canManageSiteSettings(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_site_admin");
  if (!error) return data === true;

  // Compatibility for deployments that have not applied the hardening migration yet.
  if (isMissingAdminRpc(error)) return true;
  throw error;
}
