import { headers } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { MeSnapshot, UpdateEmailInput, UpdatePasswordInput } from "@/lib/types";

function normalizeOrigin(value: string | undefined): string | null {
  const candidate = value?.split(",")[0]?.trim().replace(/\/+$/, "");
  if (!candidate) return null;

  try {
    const url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
    return url.origin;
  } catch {
    return null;
  }
}

export async function resolveAppOrigin(): Promise<string> {
  const configuredOrigin =
    normalizeOrigin(process.env.APP_ORIGIN) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeOrigin(process.env.ZEABUR_WEB_URL) ??
    normalizeOrigin(process.env.ZEABUR_URL) ??
    normalizeOrigin(process.env.VERCEL_URL);
  if (configuredOrigin) return configuredOrigin;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host")?.split(",")[0]?.trim() ?? hdrs.get("host");
  if (!host) return "http://localhost:4000";
  const proto =
    hdrs.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function countOwnedRows(supabase: SupabaseClient, table: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

function authProvidersForUser(user: User): string[] {
  const providers = new Set<string>();
  const primaryProvider = user.app_metadata?.provider;
  if (typeof primaryProvider === "string" && primaryProvider.trim()) {
    providers.add(primaryProvider.trim());
  }

  for (const identity of user.identities ?? []) {
    const provider = identity.provider?.trim();
    if (provider) providers.add(provider);
  }

  return [...providers];
}

export async function getMeSnapshot(supabase: SupabaseClient, user: User): Promise<MeSnapshot> {
  const [
    projectsCount,
    conversationsCount,
    imageRecordsCount,
    videoRecordsCount,
    canvasBoardsCount,
  ] = await Promise.all([
    countOwnedRows(supabase, "projects", user.id),
    countOwnedRows(supabase, "chat_conversations", user.id),
    countOwnedRows(supabase, "image_gallery_records", user.id),
    countOwnedRows(supabase, "video_gallery_records", user.id),
    countOwnedRows(supabase, "canvas_boards", user.id),
  ]);
  const authProviders = authProvidersForUser(user);

  return {
    user: {
      id: user.id,
      email: user.email?.trim() || "暂无",
      emailConfirmed: Boolean(user.email_confirmed_at),
      primaryProvider: authProviders[0] ?? "email",
      authProviders,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    stats: {
      projects: projectsCount,
      chatConversations: conversationsCount,
      imageRecords: imageRecordsCount,
      videoRecords: videoRecordsCount,
      canvasBoards: canvasBoardsCount,
    },
  };
}

export function validatePasswordInput(input: UpdatePasswordInput, requireCurrentPassword = true): string | null {
  if (requireCurrentPassword && !input.currentPassword) return "请填写当前密码";
  if (!input.newPassword) return "请填写新密码";
  if (input.newPassword.length < 6) return "新密码至少需要 6 位";
  if (requireCurrentPassword && input.currentPassword === input.newPassword) return "新密码不能和当前密码相同";
  return null;
}

export function validateEmailInput(input: UpdateEmailInput, currentEmail?: string | null): string | null {
  if (!input.newEmail.trim()) return "请填写新邮箱";
  if (!input.newEmail.includes("@")) return "请输入有效邮箱";
  if (currentEmail && input.newEmail.trim().toLowerCase() === currentEmail.trim().toLowerCase()) {
    return "新邮箱不能和当前邮箱相同";
  }
  return null;
}

function localizeAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) return "当前密码错误";
  if (message.includes("Password should be at least")) return "新密码至少需要 6 位";
  if (message.includes("same password")) return "新密码不能和当前密码相同";
  if (message.includes("Email rate limit exceeded")) return "邮件发送过于频繁，请稍后再试";
  if (message.includes("redirect") || message.includes("Redirect") || message.includes("URI is not allowed")) {
    return "邮箱回调地址未被 Supabase 允许，请检查 APP_ORIGIN 和 Supabase Redirect URLs 配置";
  }
  return message;
}

export async function changePassword(
  supabase: SupabaseClient,
  user: User,
  input: UpdatePasswordInput,
): Promise<{ ok: true; message: string }> {
  const authProviders = authProvidersForUser(user);
  const hasPasswordProvider = authProviders.length === 0 || authProviders.includes("email");
  const validationError = validatePasswordInput(input, hasPasswordProvider);
  if (validationError) throw new Error(validationError);
  const email = user.email?.trim();
  if (!email) throw new Error("当前账号缺少邮箱，无法修改密码");

  if (hasPasswordProvider) {
    const verify = await supabase.auth.signInWithPassword({
      email,
      password: input.currentPassword,
    });
    if (verify.error) {
      throw new Error(localizeAuthError(verify.error.message));
    }
  }

  const update = await supabase.auth.updateUser({ password: input.newPassword });
  if (update.error) {
    throw new Error(localizeAuthError(update.error.message));
  }

  return {
    ok: true,
    message: hasPasswordProvider
      ? "密码已更新，请使用新密码重新登录或继续当前会话。"
      : "密码已设置。以后可以继续用 Google 登录，也可以用邮箱密码登录。",
  };
}

export async function changeEmail(
  supabase: SupabaseClient,
  user: User,
  input: UpdateEmailInput,
): Promise<{ ok: true; message: string }> {
  const validationError = validateEmailInput(input, user.email);
  if (validationError) throw new Error(validationError);

  const baseOrigin = await resolveAppOrigin();
  const update = await supabase.auth.updateUser(
    { email: input.newEmail.trim() },
    { emailRedirectTo: `${baseOrigin}/auth/callback?next=${encodeURIComponent("/me")}` },
  );
  if (update.error) {
    throw new Error(localizeAuthError(update.error.message));
  }

  return { ok: true, message: "确认邮件已发送到新邮箱。请完成邮件确认后，新的登录邮箱才会正式生效。" };
}
