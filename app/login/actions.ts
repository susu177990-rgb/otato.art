"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requestOrigin(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  if (!host) return "http://localhost:4000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type AuthFormState = { error?: string; info?: string } | null;

function localizeAuthError(message: string): string {
  if (message.includes("Invalid login credentials")) return "邮箱或密码错误";
  if (message.includes("Email not confirmed")) return "请先查收邮件并点击验证链接后再登录";
  if (message.includes("User already registered")) return "该邮箱已注册，请直接登录";
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

  const baseOrigin = await requestOrigin();
  const supabase = await createSupabaseServerClient();
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
