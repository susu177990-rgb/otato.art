import { NextRequest } from "next/server";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { loadSystemPrompt } from "@/lib/prompt-loader";
import { normalizeCreativeDirectionId } from "@/lib/creative-directions";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { resolveLlmModel } from "@/lib/llm-models";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";

interface ChatRequestBody {
  messages: Message[];
  creativeDirectionId?: string;
  /** 工程侧项目状态（验收、圣经等），追加在系统提示后 */
  projectContext?: string;
  preferredLlmModelId?: string;
}

function boundedLegacyMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.filter((message): message is Message => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const row = message as Partial<Message>;
    return (row.role === "user" || row.role === "assistant") && typeof row.content === "string";
  });
  const selected: Message[] = [];
  let chars = 0;
  for (let index = normalized.length - 1; index >= 0 && selected.length < 40; index -= 1) {
    const message = normalized[index];
    if (selected.length > 0 && chars + message.content.length > 80_000) break;
    selected.push(message);
    chars += message.content.length;
  }
  return selected.reverse();
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = boundedLegacyMessages(body.messages);
  const { creativeDirectionId, projectContext } = body;
  if (!messages?.length) {
    return Response.json({ error: "消息格式无效或为空", code: "INVALID_CHAT_MESSAGES" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "请先登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const snapshot = await getWorkspaceSnapshot(supabase);
  const modelConfig = resolveLlmModel(snapshot.llm, body.preferredLlmModelId);

  if (!modelConfig.apiKey) {
    return new Response(
      JSON.stringify({ error: "网站内部 LLM API 暂未配置，请联系管理员。" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const normalizedDirectionId = normalizeCreativeDirectionId(creativeDirectionId);
  const systemPrompt = loadSystemPrompt(normalizedDirectionId);
  const systemContent =
    projectContext && projectContext.trim().length > 0
      ? `${systemPrompt}\n\n---\n【工程注入 · 须服从】\n${projectContext.trim()}`
      : systemPrompt;

  const apiMessages = [
    { role: "system" as const, content: systemContent },
    ...messages,
  ];

  const apiUrl = modelConfig.apiUrl || "https://api.openai.com/v1/chat/completions";

  try {
    const upstream = await fetchWithRetry(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.modelName || "gpt-4o",
        messages: apiMessages,
        stream: true,
      }),
    }, { maxAttempts: 1 });

    if (!upstream.ok) {
      const errText = (await upstream.text()).slice(0, 2_000);
      console.error("[legacy chat upstream]", upstream.status, errText);
      const error = upstream.status === 429
        ? "当前模型通道请求过于频繁，请稍后再试或切换其他模型。"
        : `当前模型通道请求失败（${upstream.status}）。`;
      return new Response(
        JSON.stringify({ error, code: upstream.status === 429 ? "LLM_RATE_LIMITED" : "LLM_UPSTREAM_ERROR" }),
        { status: upstream.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const reader = upstream.body?.getReader();
    if (!reader) {
      return new Response(
        JSON.stringify({ error: "无法获取上游响应流" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`)
                  );
                }
              } catch {
                // skip malformed chunk
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `请求失败: ${err instanceof Error ? err.message : String(err)}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
