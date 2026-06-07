"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthFormState } from "@/app/login/actions";

function localizeResetError(message: string): string {
  if (message.includes("Auth session missing")) return "重设密码链接已失效，请重新发送邮件。";
  if (message.includes("Password should be at least")) return "新密码至少需要 6 位。";
  return message;
}

export async function updateRecoveredPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || !confirmPassword) {
    return { error: "请填写新密码并确认" };
  }
  if (password.length < 6) {
    return { error: "新密码至少需要 6 位。" };
  }
  if (password !== confirmPassword) {
    return { error: "两次输入的密码不一致" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "重设密码链接已失效，请重新发送邮件。" };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { error: localizeResetError(error.message) };
    }

    return { info: "密码已更新。现在可以使用新密码登录。" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "重设密码失败" };
  }
}
