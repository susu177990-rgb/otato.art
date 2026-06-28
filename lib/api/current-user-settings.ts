import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
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
  const snapshot = await getWorkspaceSnapshot(supabase);
  if (!snapshot.llm.apiKey?.trim()) {
    return {
      ok: false,
      response: Response.json({ error: "网站内部 LLM API 暂未配置，请联系管理员。" }, { status: 400 }),
    };
  }
  return { ok: true, userId: user.id, settings: snapshot.llm };
}
