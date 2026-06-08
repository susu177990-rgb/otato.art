import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import type { Settings } from "@/lib/types";

export async function requireCurrentUserLlmSettings(
  supabase: SupabaseClient,
): Promise<{ ok: true; userId: string; settings: Settings } | { ok: false; response: Response }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: Response.json({ error: "请先登录" }, { status: 401 }) };
  }
  const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
  if (!snapshot.llm.apiKey?.trim()) {
    const message = snapshot.apiUsageMode?.llm === "user"
      ? "请到设置页填写自己的 LLM API Key。"
      : "网站内部 LLM API 暂未配置，请联系管理员。";
    return {
      ok: false,
      response: Response.json({ error: message }, { status: 400 }),
    };
  }
  return { ok: true, userId: user.id, settings: snapshot.llm };
}
