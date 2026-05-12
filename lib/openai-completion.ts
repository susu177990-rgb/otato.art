import type { Settings } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

/**
 * OpenAI 兼容 Chat Completions，非流式；用于立项分析、元数据抽取等。
 */
export async function completeChatNonStream(params: {
  settings: Settings;
  messages: ChatMsg[];
  temperature?: number;
}): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const { settings, messages, temperature = 0.2 } = params;
  if (!settings?.apiKey) {
    return { ok: false, error: "缺少 API Key" };
  }
  const apiUrl = settings.apiUrl || "https://api.openai.com/v1/chat/completions";
  try {
    const upstream = await fetchWithRetry(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o",
        messages,
        stream: false,
        temperature,
      }),
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return { ok: false, error: `API 错误 (${upstream.status}): ${text.slice(0, 500)}` };
    }
    const parsed = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = parsed.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return { ok: false, error: "模型未返回内容" };
    }
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
