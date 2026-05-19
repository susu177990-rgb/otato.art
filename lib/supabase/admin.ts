import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

let adminClient: SupabaseClient | null = null;

/** 仅服务端脚本 / 迁移使用；绕过 RLS */
export function createSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
