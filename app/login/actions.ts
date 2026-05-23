"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function requestOrigin(): Promise<string> {
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

export type AuthFormState = { error?: string; info?: string } | null;

function localizeAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) return "邮箱或密码错误";
  if (message.includes("Email not confirmed")) return "请先查收邮件并点击验证链接后再登录";
  if (message.includes("User already registered")) return "该邮箱已注册，请直接登录";
  if (message.includes("Signup is disabled")) {
    return "当前 Supabase 项目关闭了邮箱注册，请在 Authentication → Providers → Email 开启注册。";
  }
  if (message.includes("Email rate limit exceeded")) return "验证邮件发送太频繁，请稍后再试。";
  if (message.includes("Password should be at least")) return "密码至少需要 6 位。";
  if (message.includes("redirect") || message.includes("Redirect") || message.includes("URI is not allowed")) {
    return "注册回调地址未被 Supabase 允许：请在 Authentication → URL Configuration 的 Redirect URLs 加入当前域名的 /auth/callback，或配置 APP_ORIGIN 后重新部署。";
  }
  return message;
}

export async function loginWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const safeNext = next.startsWith("/") ? next : "/";

  if (!email || !password) {
    return { error: "请填写邮箱和密码" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: localizeAuthError(error.message) };
  }

  redirect(safeNext);
}

export async function signUpWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const safeNext = next.startsWith("/") ? next : "/";

  if (!email || !password) {
    return { error: "请填写邮箱和密码" };
  }

  if (password.length < 6) {
    return { error: "密码至少需要 6 位。" };
  }

  let supabase: SupabaseClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Supabase 初始化失败" };
  }

  const baseOrigin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  });

  if (error) {
    return { error: localizeAuthError(error.message) };
  }

  if (data.session) {
    redirect(safeNext);
  }

  return { info: "注册成功。若启用了邮箱验证，请查收邮件后点击链接登录。" };
}
