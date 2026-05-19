export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

/** 是否已配置浏览器/服务端 Supabase 连接（proxy、登录页依赖此项） */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}

export function getSupabaseUrl(): string {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "缺少环境变量 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY。请复制 .env.example 为 .env.local 并填写，或在 Zeabur 配置同名变量后重启。",
    );
  }
  return env.url;
}

export function getSupabaseAnonKey(): string {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "缺少环境变量 NEXT_PUBLIC_SUPABASE_ANON_KEY。请复制 .env.example 为 .env.local 并填写，或在 Zeabur 配置同名变量后重启。",
    );
  }
  return env.anonKey;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("缺少环境变量 SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

export function getSiteSettingsAdminEmails(): string[] {
  return (process.env.SITE_SETTINGS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
