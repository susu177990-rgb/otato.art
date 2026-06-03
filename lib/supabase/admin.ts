import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl, hasSupabaseServiceRoleKey } from "./env";

let adminClient: SupabaseClient | null = null;

/** 仅服务端脚本 / 迁移使用；绕过 RLS */
export function createSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export function maybeCreateSupabaseAdminClient(): SupabaseClient | null {
  if (!hasSupabaseServiceRoleKey()) return null;
  return createSupabaseAdminClient();
}
