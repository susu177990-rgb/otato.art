import type { ChatMessage } from "@/lib/chat/types";

export type ImageGenerationIntent = {
  active: boolean;
  /** 本条用户消息是否含图片附件（仅在明确生图/改图时作为参考图） */
  hasReferenceImages: boolean;
  /** 本条是否仅有图、几乎无文字；这本身不代表要生图 */
  referenceOnly: boolean;
};

const IMAGE_INTENT_PATTERNS: RegExp[] = [
  /生图|画图|作图|绘图|出图|配图|分镜图|概念图|立绘|海报图|封面图/,
  /生成.{0,6}(?:图|图片|插画|海报|分镜|封面)/,
  /做.{0,4}(?:图|图片|插画|海报|分镜|封面)/,
  /画.{0,4}(?:一|个|张|幅|点|出)?(?:图|插画|海报|分镜|场景)/,
  /帮我画|给我画|请画|画一下|画张|画一幅/,
  /画(?:一只|一个|一张|一幅|个|点)?[\u4e00-\u9fa5a-zA-Z]{1,24}(?:猫|狗|鸟|花|人|场景|海报|封面)/,
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

  if (
    hasRef &&
    (
      /图生图|以图生图|参考图生/.test(text) ||
      /(?:根据|用|参考|基于|按|照着).{0,12}(?:这张|上传的)?(?:图|参考)?.{0,12}(?:生成|生图|画|绘制|出图|做(?:一张)?图|改|修改|修图|换|替换|重绘)/i.test(text) ||
      /(?:改|修改|修图|换|替换|重绘).{0,16}(?:这张|上传的)?(?:图|图片|参考)/i.test(text)
    )
  ) {
    return { active: true, hasReferenceImages: true, referenceOnly: false };
  }

  const active = IMAGE_INTENT_PATTERNS.some((re) => re.test(text));
  return { active, hasReferenceImages: hasRef, referenceOnly };
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
    "用户本条需求是生成/绘制真实图片。系统将自动调用作图 API；你只有在看到【系统·生图结果】且 JSON 中 success 为 true 并含 media_url 时，才可说已生成。\n" +
    "若未见该 JSON 或 success 为 false，必须明确说明未出图或失败原因，禁止假装已生成。\n" +
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

/**
 * 仅传 OpenAI 通用字符串（auto / none / required）。
 * 部分中转（如 Rix/Grsai）不支持 `tool_choice: { type, function: { name } }`，会 400 unknown_parameter。
 * 生图意图改由用户消息 booster + agent 服务端 fallback 保证执行。
 */
export function openAiToolChoiceForImageIntent(_force: boolean): string {
  void _force;
  return "auto";
}

/** LLM 未调工具时的服务端兜底：用用户原文 + 本条附件 id 直接生图 */
export function buildFallbackGenerateImageArgs(messages: ChatMessage[]): string {
  const last = lastUserMessage(messages);
  let prompt = last ? userMessagePlainText(last) : "";
  prompt = prompt
    .replace(/【生图指令·必须执行】[\s\S]*?(?=\n\n|$)/, "")
    .replace(/【Slash 指令约束】[\s\S]*?(?=\n\n|$)/, "")
    .replace(/^\/grid-all\s+/i, "")
    .replace(/^\/grid\s+/i, "")
    .trim();

  const rawHead = last ? userMessagePlainText(last).split(/\s+/)[0] ?? "" : "";
  if (/^\/grid/i.test(rawHead)) {
    const body = prompt || "分镜画面";
    prompt = `影视分镜九宫格构图，单张图内含 3x3 分镜格子，风格统一，${body}`;
  }

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
