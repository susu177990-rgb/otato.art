import type { ChatApiConfig, ChatAttachment, ChatMessage, ChatToolCall } from "@/lib/chat/types";

export const CHAT_MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

function dataUrlByteLength(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  if (idx === -1) return dataUrl.length;
  const b64 = dataUrl.slice(idx + 1).replace(/\s/g, "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

function attachmentToApiParts(att: ChatAttachment): unknown[] {
  if (att.kind === "image" || att.mime.startsWith("image/")) {
    return [{ type: "image_url", image_url: { url: att.dataUrl } }];
  }
  if (att.kind === "video" || att.mime.startsWith("video/")) {
    return [{ type: "video_url", video_url: { url: att.dataUrl } }];
  }
  return [
    {
      type: "text",
      text: `用户上传了文件「${att.name}」（MIME: ${att.mime}）。当前版本未将二进制发往模型，请结合文件名与上下文作答。`,
    },
  ];
}

function buildUserAssistantContent(msg: ChatMessage): string | unknown[] {
  const content: unknown[] = [];
  for (const part of msg.parts) {
    if (part.type === "text") {
      if (part.text.trim()) content.push({ type: "text", text: part.text });
    } else {
      const sz = dataUrlByteLength(part.attachment.dataUrl);
      if (sz > CHAT_MAX_ATTACHMENT_BYTES) {
        content.push({
          type: "text",
          text: `[附件「${part.attachment.name}」超过 ${Math.round(CHAT_MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB，已跳过上传]`,
        });
        continue;
      }
      content.push(...attachmentToApiParts(part.attachment));
    }
  }

  if (content.length === 0) content.push({ type: "text", text: " " });

  const onlyText =
    content.length === 1 &&
    typeof content[0] === "object" &&
    content[0] !== null &&
    (content[0] as { type?: string }).type === "text";

  if (onlyText) {
    return (content[0] as { text: string }).text;
  }

  return content;
}

export function messageToOpenAiMessage(msg: ChatMessage): Record<string, unknown> {
  if (msg.role === "system") {
    const text = msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    return { role: "system", content: text || " " };
  }

  if (msg.role === "tool") {
    const text = msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    return {
      role: "tool",
      tool_call_id: msg.toolCallId || "",
      content: text || "",
    };
  }

  const payload = buildUserAssistantContent(msg);

  if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
    const out: Record<string, unknown> = {
      role: "assistant",
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments || "{}" },
      })),
    };

    if (typeof payload === "string") {
      out.content = payload.trim() ? payload : null;
    } else if (Array.isArray(payload)) {
      const arr = payload as unknown[];
      out.content = arr.length ? arr : null;
    } else {
      out.content = null;
    }
    return out;
  }

  return { role: msg.role, content: payload };
}

export function validateMessagesForSend(messages: ChatMessage[]): void {
  if (!messages?.length) {
    throw new Error("对话消息为空，无法请求 API（请确认至少有一条用户消息）");
  }

  for (const m of messages) {
    if (m.role === "tool" || m.role === "system") continue;
    for (const p of m.parts) {
      if (p.type !== "attachment") continue;
      const sz = dataUrlByteLength(p.attachment.dataUrl);
      if (sz > CHAT_MAX_ATTACHMENT_BYTES) {
        throw new Error(
          `附件「${p.attachment.name}」过大（>${Math.round(CHAT_MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB），请移除或压缩后再发送`,
        );
      }
    }
  }
}

export function parseAssistantChoice(data: Record<string, unknown>): {
  contentText: string | null;
  toolCalls: ChatToolCall[];
} {
  const choices = data.choices as Array<{ message?: Record<string, unknown> }> | undefined;
  const message = choices?.[0]?.message;
  if (!message) return { contentText: null, toolCalls: [] };

  const rawCalls = message.tool_calls as
    | Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>
    | undefined;

  const toolCalls: ChatToolCall[] = [];
  if (Array.isArray(rawCalls)) {
    for (let i = 0; i < rawCalls.length; i++) {
      const c = rawCalls[i];
      const fn = c?.function;
      const name = fn?.name?.trim();
      if (!name) continue;
      const rawArgs = fn?.arguments;
      toolCalls.push({
        id: (typeof c?.id === "string" && c.id) || `call-${i}-${Date.now()}`,
        name,
        arguments: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs ?? {}, null, 0),
      });
    }
  }

  const content = message.content;
  let contentText: string | null = null;
  if (typeof content === "string") {
    contentText = content;
  } else if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const part of content) {
      if (part && typeof part === "object") {
        const o = part as { type?: string; text?: string };
        if (o.type === "text" && o.text) texts.push(o.text);
      } else if (typeof part === "string") texts.push(part);
    }
    contentText = texts.length ? texts.join("\n") : null;
  }

  if (!contentText?.trim()) {
    for (const key of ["reasoning_content", "reasoning", "text"] as const) {
      const alt = message[key];
      if (typeof alt === "string" && alt.trim()) {
        contentText = alt.trim();
        break;
      }
    }
  }

  return { contentText, toolCalls };
}

export interface ChatCompletionRawOptions {
  tools?: unknown[];
  tool_choice?: string;
}

export async function sendChatCompletionRaw(
  apiConfig: ChatApiConfig,
  messages: ChatMessage[],
  options?: ChatCompletionRawOptions,
): Promise<Record<string, unknown>> {
  const endpointUrl = apiConfig.endpointUrl?.trim();
  const apiKey = apiConfig.apiKey?.trim();
  const modelName = apiConfig.modelName?.trim();
  if (!endpointUrl || !modelName || !apiKey) {
    throw new Error("请先在设置 → LLM API 中填写 API URL、模型与 API Key");
  }
  if (/[^\x00-\x7F]/.test(apiKey)) {
    throw new Error("API Key 包含非法字符（如中文）。请检查设置并确保只包含英文字母、数字和常规符号。");
  }

  validateMessagesForSend(messages);

  const apiMsgs = messages.map(messageToOpenAiMessage);
  if (!apiMsgs.length) {
    throw new Error("内部错误：映射后的 messages 为空，无法请求 API");
  }

  const payload: Record<string, unknown> = {
    model: modelName,
    messages: apiMsgs,
  };

  if (options?.tools?.length) {
    payload.tools = options.tools;
    payload.tool_choice = options.tool_choice ?? "auto";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("LLM API 请求超时（180s），请检查模型/中转是否可用，或缩短对话历史后重试");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errBody}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
