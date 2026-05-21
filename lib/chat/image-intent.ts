import type { ChatMessage } from "@/lib/chat/types";

export type ImageGenerationIntent = {
  active: boolean;
  /** 本条用户消息是否含图片附件（应用作参考图） */
  hasReferenceImages: boolean;
  /** 本条是否仅有图、几乎无文字（典型图生图/改图） */
  referenceOnly: boolean;
};

const IMAGE_INTENT_PATTERNS: RegExp[] = [
  /生图|画图|作图|绘图|出图|配图|分镜图|概念图|立绘|海报图|封面图/,
  /生成.{0,6}(?:图|图片|插画|海报|分镜|封面)/,
  /画.{0,4}(?:一|个|张|幅|点|出)?(?:图|插画|海报|分镜|场景)/,
  /帮我画|给我画|请画|画一下|画张|画一幅/,
  /图生图|以图生图|参考图生|用这张(?:图|参考)|根据(?:这张|上传的)图/,
  /\b(?:generate|create|draw|make)\s+(?:an?\s+)?(?:image|picture|illustration|poster)\b/i,
  /\bimage\s+generation\b/i,
];

const IMAGE_INTENT_NEGATIVE: RegExp[] = [
  /不要(?:生|画|作|绘)?图|别(?:生|画|作|绘)?图|不用(?:生|画|作|绘)?图|无需配图/,
  /(?:如何|怎么|怎样).{0,8}(?:生图|画图|作图|绘图)/,
  /只(?:要|需|用).{0,6}(?:文字|文案|剧本|大纲)|不要图/,
];

function lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

function userMessagePlainText(msg: ChatMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function userMessageHasImageAttachment(msg: ChatMessage): boolean {
  return msg.parts.some(
    (p) =>
      p.type === "attachment" &&
      (p.attachment.kind === "image" || p.attachment.mime.startsWith("image/")),
  );
}

/** 判断 /chat 本轮用户是否在要求真实作图（非「怎么画图」类纯咨询） */
export function detectImageGenerationIntent(messages: ChatMessage[]): ImageGenerationIntent {
  const last = lastUserMessage(messages);
  if (!last) return { active: false, hasReferenceImages: false, referenceOnly: false };

  const text = userMessagePlainText(last);
  const hasRef = userMessageHasImageAttachment(last);
  const referenceOnly = hasRef && text.length < 12;

  if (IMAGE_INTENT_NEGATIVE.some((re) => re.test(text))) {
    return { active: false, hasReferenceImages: hasRef, referenceOnly };
  }

  if (referenceOnly) {
    return { active: true, hasReferenceImages: true, referenceOnly: true };
  }

  if (hasRef && /改|修|换|风格|参考|基于|按这张|照着/i.test(text)) {
    return { active: true, hasReferenceImages: true, referenceOnly: false };
  }

  const active = IMAGE_INTENT_PATTERNS.some((re) => re.test(text));
  return { active, hasReferenceImages: hasRef, referenceOnly: false };
}

export function buildImageIntentBooster(intent: ImageGenerationIntent): string {
  const refLine = intent.hasReferenceImages
    ? "用户附带了参考图：请在 generate_image 的 ref_image_urls 中填入本会话 attachment_id（可先 list_conversation_attachments）。"
    : "";

  const refOnlyLine = intent.referenceOnly
    ? "用户主要上传了图片、文字很少：请根据画面与用户意图推断 prompt，并调用 generate_image。"
    : "";

  return (
    "【生图指令·必须执行】\n" +
    "用户本条需求是生成/绘制真实图片。你必须在本轮调用 generate_image（禁止仅用文字假装已出图、禁止编造 media_url）。\n" +
    "- prompt：根据用户描述与上下文写成完整绘图提示词（可中文）。\n" +
    "- preset_id 可省略，使用对话栏默认生图模型。\n" +
    `${refLine}\n${refOnlyLine}\n`.trim()
  );
}

function cloneMessagesForEphemeralEdit(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : p.type === "attachment"
          ? { type: "attachment", attachment: { ...p.attachment } }
          : p,
    ),
  }));
}

export function applyImageIntentBoosterToLastUser(
  messages: ChatMessage[],
  booster: string | null,
): ChatMessage[] {
  if (!booster?.trim()) return messages;

  const cloned = cloneMessagesForEphemeralEdit(messages);
  const prefix = `${booster.trim()}\n\n`;

  for (let i = cloned.length - 1; i >= 0; i--) {
    if (cloned[i].role !== "user") continue;
    const m = cloned[i];
    const ti = m.parts.findIndex((p) => p.type === "text");
    if (ti >= 0) {
      const tp = m.parts[ti];
      if (tp.type === "text") {
        m.parts[ti] = { type: "text", text: prefix + tp.text };
      }
    } else {
      m.parts.unshift({ type: "text", text: prefix.trimEnd() });
    }
    break;
  }
  return cloned;
}

export function openAiToolChoiceForImageIntent(force: boolean): string | Record<string, unknown> {
  if (!force) return "auto";
  return { type: "function", function: { name: "generate_image" } };
}

/** LLM 未调工具时的服务端兜底：用用户原文 + 本条附件 id 直接生图 */
export function buildFallbackGenerateImageArgs(messages: ChatMessage[]): string {
  const last = lastUserMessage(messages);
  let prompt = last ? userMessagePlainText(last) : "";
  prompt = prompt
    .replace(/【生图指令·必须执行】[\s\S]*?(?=\n\n|$)/, "")
    .replace(/【Slash 指令约束】[\s\S]*?(?=\n\n|$)/, "")
    .trim();

  const refIds: string[] = [];
  if (last) {
    for (const part of last.parts) {
      if (part.type === "attachment" && part.attachment.registryId) {
        refIds.push(part.attachment.registryId);
      }
    }
  }

  if (!prompt && refIds.length > 0) {
    prompt = "根据用户上传的参考图生成高质量图像，保持主体特征并提升画面质感";
  }
  if (!prompt) {
    prompt = "根据用户对话上下文生成一张高质量插图";
  }

  return JSON.stringify({
    prompt,
    ref_image_urls: refIds.length ? refIds : undefined,
  });
}
