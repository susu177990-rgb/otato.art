import type { ChatMessage, ChatMessagePart, ConversationAttachmentEntry } from "@/lib/chat/types";

export const CHAT_HISTORY_MAX_MESSAGES = 40;
export const CHAT_HISTORY_MAX_TEXT_CHARS = 80_000;

function attachmentTextDescriptor(part: ChatMessagePart): ChatMessagePart {
  if (part.type !== "attachment") return part;

  const a = part.attachment;
  const safeName = a.name.replace(/"/g, "'");
  const idText = a.registryId ? ` attachment_id="${a.registryId}"` : "";
  const toolHint = a.registryId
    ? `如需真实生图/改图，generate_image 的 ref_image_urls 可直接传 "${a.registryId}"。`
    : "如需真实生图/改图，请根据当前用户指令继续判断是否调用作图流程。";

  return {
    type: "text",
    text:
      `[用户上传了附件${idText} name="${safeName}" kind=${a.kind} mime=${a.mime}] ` +
      `文本对话模型只收到这段附件说明，未接收二进制图片/视频内容；不要假装已经看清画面细节。${toolHint}`,
  };
}

export function buildAttachmentsById(
  entries: ConversationAttachmentEntry[] | undefined,
): Record<string, ConversationAttachmentEntry> {
  const m: Record<string, ConversationAttachmentEntry> = {};
  if (!entries?.length) return m;
  for (const e of entries) m[e.id] = e;
  return m;
}

export function compactAllAttachmentsForTextOnlyApi(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" && m.role !== "assistant") return m;
    return {
      ...m,
      parts: m.parts.map(attachmentTextDescriptor),
    };
  });
}

export function compactMessagesForAgentApi(messages: ChatMessage[]): ChatMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  return messages.map((m, idx) => {
    if (m.role !== "user" && m.role !== "assistant") return m;
    if (idx === lastUserIdx) return m;

    const newParts: ChatMessagePart[] = [];
    for (const part of m.parts) {
      if (part.type === "attachment" && part.attachment.registryId) {
        const a = part.attachment;
        const safeName = a.name.replace(/"/g, "'");
        newParts.push({
          type: "text",
          text:
            `[会话附件 attachment_id="${a.registryId}" name="${safeName}" kind=${a.kind} mime=${a.mime}] ` +
            `二进制未重复附带。请 list_conversation_attachments 查看列表；get_attachment({"attachment_id":"${a.registryId}"}) 查看说明；` +
          `generate_image 的 ref_image_urls 可直接传 "${a.registryId}"（无需粘贴 base64）。`,
        });
      } else if (part.type === "attachment") {
        newParts.push(attachmentTextDescriptor(part));
      } else {
        newParts.push(part);
      }
    }
    return { ...m, parts: newParts };
  });
}

function textLength(message: ChatMessage): number {
  return message.parts.reduce((total, part) => total + (part.type === "text" ? part.text.length : 0), 0);
}

function normalizeLocalToolMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "tool") return message;
  const text = message.parts
    .filter((part): part is Extract<ChatMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .slice(0, 4_000);
  return {
    id: `${message.id}-context`,
    role: "assistant",
    createdAt: message.createdAt,
    parts: [{ type: "text", text: `【先前的系统工具结果】\n${text || "（无文本结果）"}` }],
  };
}

/**
 * 为上游 LLM 构建有界历史：旧附件只保留引用说明，本地工具结果转成普通上下文，
 * 避免发送缺少对应 tool_call 的 OpenAI tool 消息。
 */
export function prepareConversationHistoryForLlm(messages: ChatMessage[]): ChatMessage[] {
  const normalized = compactMessagesForAgentApi(
    messages
      .filter((message) => message.role !== "system")
      .map(normalizeLocalToolMessage),
  );

  const selected: ChatMessage[] = [];
  let textChars = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index];
    const nextChars = textLength(message);
    if (selected.length >= CHAT_HISTORY_MAX_MESSAGES) break;
    if (selected.length > 0 && textChars + nextChars > CHAT_HISTORY_MAX_TEXT_CHARS) break;
    selected.push(message);
    textChars += nextChars;
  }
  return selected.reverse();
}
