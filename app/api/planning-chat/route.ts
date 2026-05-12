import { NextRequest } from "next/server";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { loadAdaptationPlannerPrompt, loadPlanningSessionPrompt } from "@/lib/prompt-loader";
import type { Message, Settings } from "@/lib/types";

export const runtime = "nodejs";

export type PlanningSessionKind = "planning" | "adaptation_planner";

interface PlanningChatBody {
  messages: Message[];
  settings: Settings;
  /** 立项元数据 + 素材节选，拼在系统提示后 */
  planningBootstrap: string;
  /** 改编线规划师阶段使用 adaptation_planner */
  sessionKind?: PlanningSessionKind;
}

export async function POST(req: NextRequest) {
  let body: PlanningChatBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, settings, planningBootstrap, sessionKind = "planning" } = body;

  if (!settings?.apiKey) {
    return new Response(
      JSON.stringify({ error: "请先在设置中填写 API Key" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const base =
    sessionKind === "adaptation_planner" ? loadAdaptationPlannerPrompt() : loadPlanningSessionPrompt();
  const systemContent =
    planningBootstrap && planningBootstrap.trim().length > 0
      ? `${base}\n\n---\n【立项素材与元数据】\n${planningBootstrap.trim()}`
      : base;

  const apiMessages = [{ role: "system" as const, content: systemContent }, ...messages];

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
        messages: apiMessages,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return new Response(
        JSON.stringify({ error: `API 错误 (${upstream.status}): ${errText}` }),
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
                // skip
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
