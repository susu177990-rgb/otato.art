import type { ChatMessage } from "@/lib/chat/types";

export type ImageGenerationIntent = {
  active: boolean;
  /** 本条用户消息是否含图片附件（仅在明确生图/改图时作为参考图） */
  hasReferenceImages: boolean;
  /** 本条是否仅有图、几乎无文字；这本身不代表要生图 */
  referenceOnly: boolean;
};

const IMAGE_INTENT_PATTERNS: RegExp[] = [
  /(?:^|[，。！？\s])(?:请|帮我|给我|替我)?(?:生成|绘制|画|做|制作|创作|出)(?:一张|一个|一幅|一组|张|幅)?[^，。！？\n]{0,30}(?:图|图片|插画|海报|分镜|封面|概念图|立绘)(?:$|[，。！？\s])/,
  /(?:^|[，。！？\s])(?:生图|画图|作图|绘图|出图)(?:$|[：:，。！？\s])/,
  /帮我画|给我画|请画|画一下|画张|画一幅/,
  /图生图|以图生图|参考图生/,
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
      /(?:根据|用|参考|基于|按|照着).{0,12}(?:这张|上传的)?(?:图|参考)?.{0,12}(?:生成|生图|画|绘制|出图|做(?:一张)?[^，。！？\n]{0,12}(?:图|图片|插画|海报|分镜|封面)|改|修改|修图|换|替换|重绘)/i.test(text) ||
      /(?:改|修改|修图|换|替换|重绘).{0,16}(?:这张|上传的)?(?:图|图片|参考)/i.test(text)
    )
  ) {
    return { active: true, hasReferenceImages: true, referenceOnly: false };
  }

  const active = IMAGE_INTENT_PATTERNS.some((re) => re.test(text));
  return { active, hasReferenceImages: hasRef, referenceOnly };
}

/** 明确生图指令的确定性参数：使用用户原文与本轮附件 id。 */
export function buildFallbackGenerateImageArgs(messages: ChatMessage[]): string {
  const last = lastUserMessage(messages);
  let prompt = last ? userMessagePlainText(last) : "";
  prompt = prompt
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
