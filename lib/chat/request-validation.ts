import type { ChatMessage, ChatMessagePart } from "@/lib/chat/types";
import { ChatServiceError } from "@/lib/chat/errors";
import {
  CHAT_MAX_ATTACHMENT_BYTES,
  CHAT_MAX_ATTACHMENTS_PER_TURN,
  CHAT_MAX_TOTAL_ATTACHMENT_BYTES,
  CHAT_MAX_USER_TEXT_CHARS,
} from "@/lib/chat/limits";

export {
  CHAT_MAX_ATTACHMENTS_PER_TURN,
  CHAT_MAX_TOTAL_ATTACHMENT_BYTES,
} from "@/lib/chat/limits";

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function parseChatUserMessage(value: unknown): ChatMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChatServiceError("INVALID_CHAT_MESSAGE", 400, "消息格式无效。");
  }
  const raw = value as Partial<ChatMessage>;
  if (raw.role !== "user" || typeof raw.id !== "string" || !raw.id.trim() || !Array.isArray(raw.parts)) {
    throw new ChatServiceError("INVALID_CHAT_MESSAGE", 400, "只能发送有效的用户消息。");
  }

  const parts: ChatMessagePart[] = [];
  let attachmentCount = 0;
  let attachmentBytes = 0;
  let textChars = 0;
  const registryIds = new Set<string>();

  for (const part of raw.parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      throw new ChatServiceError("INVALID_CHAT_PART", 400, "消息包含无效内容。");
    }
    if (part.type === "text") {
      if (typeof part.text !== "string") throw new ChatServiceError("INVALID_CHAT_TEXT", 400, "文本消息无效。");
      textChars += part.text.length;
      parts.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type !== "attachment" || !part.attachment || typeof part.attachment !== "object") {
      throw new ChatServiceError("INVALID_CHAT_PART", 400, "消息包含不支持的内容类型。");
    }
    const attachment = part.attachment;
    if (attachment.kind !== "image" || !attachment.mime.startsWith("image/")) {
      throw new ChatServiceError("UNSUPPORTED_CHAT_ATTACHMENT", 400, "当前对话仅支持图片附件。");
    }
    if (!attachment.dataUrl.startsWith("data:image/") || !attachment.dataUrl.includes(";base64,")) {
      throw new ChatServiceError("INVALID_CHAT_ATTACHMENT", 400, "图片附件格式无效。");
    }
    const registryId = attachment.registryId?.trim();
    if (!registryId || registryIds.has(registryId)) {
      throw new ChatServiceError("INVALID_ATTACHMENT_ID", 400, "图片附件标识无效或重复。");
    }
    registryIds.add(registryId);
    const bytes = dataUrlByteLength(attachment.dataUrl);
    if (bytes > CHAT_MAX_ATTACHMENT_BYTES) {
      throw new ChatServiceError("CHAT_ATTACHMENT_TOO_LARGE", 413, `单张图片不能超过 ${CHAT_MAX_ATTACHMENT_BYTES / 1024 / 1024}MB。`);
    }
    attachmentCount += 1;
    attachmentBytes += bytes;
    parts.push({ type: "attachment", attachment: { ...attachment, registryId } });
  }

  if (textChars > CHAT_MAX_USER_TEXT_CHARS) {
    throw new ChatServiceError("CHAT_TEXT_TOO_LARGE", 413, "本轮文字过长，请缩短后重试。");
  }
  if (attachmentCount > CHAT_MAX_ATTACHMENTS_PER_TURN || attachmentBytes > CHAT_MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new ChatServiceError(
      "CHAT_ATTACHMENTS_TOO_LARGE",
      413,
      `每轮最多上传 ${CHAT_MAX_ATTACHMENTS_PER_TURN} 张图片，且总大小不能超过 ${CHAT_MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024}MB。`,
    );
  }
  if (!parts.some((part) => part.type === "text" && part.text.trim()) && attachmentCount === 0) {
    throw new ChatServiceError("EMPTY_CHAT_MESSAGE", 400, "消息不能为空。");
  }

  return {
    id: raw.id.trim().slice(0, 160),
    role: "user",
    createdAt: Date.now(),
    parts,
  };
}
