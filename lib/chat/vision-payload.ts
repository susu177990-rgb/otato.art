import sharp from "sharp";
import type { ChatMessage, ChatMessagePart } from "@/lib/chat/types";
import { ChatServiceError } from "@/lib/chat/errors";

const LLM_IMAGE_MAX_EDGE = 1600;
const LLM_IMAGE_JPEG_QUALITY = 78;
const LLM_IMAGE_MAX_PIXELS = 40_000_000;
const LLM_VISION_PAYLOAD_MAX_CHARS = 6 * 1024 * 1024;

function parseImageDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/[^;,]+;base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match) return null;
  return Buffer.from(match[1].replace(/\s/g, ""), "base64");
}

async function optimizeImagePart(part: ChatMessagePart): Promise<ChatMessagePart> {
  if (part.type !== "attachment") return part;
  const attachment = part.attachment;

  if (attachment.kind === "video" || attachment.mime.startsWith("video/")) {
    return {
      type: "text",
      text: `[用户上传了视频「${attachment.name}」；普通 LLM 请求未附带视频二进制，请勿声称已看过视频内容。]`,
    };
  }

  if (attachment.kind !== "image" && !attachment.mime.startsWith("image/")) return part;
  const source = parseImageDataUrl(attachment.dataUrl);
  if (!source) return part;

  try {
    const pipeline = sharp(source, { animated: false });
    const metadata = await pipeline.metadata();
    if ((metadata.width ?? 0) * (metadata.height ?? 0) > LLM_IMAGE_MAX_PIXELS) {
      throw new ChatServiceError("CHAT_IMAGE_TOO_MANY_PIXELS", 413, "图片像素尺寸过大，请缩小图片后重试。");
    }
    const optimized = await pipeline
      .rotate()
      .resize({
        width: LLM_IMAGE_MAX_EDGE,
        height: LLM_IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: LLM_IMAGE_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return {
      type: "attachment",
      attachment: {
        ...attachment,
        mime: "image/jpeg",
        dataUrl: `data:image/jpeg;base64,${optimized.toString("base64")}`,
      },
    };
  } catch (error) {
    if (error instanceof ChatServiceError) throw error;
    console.warn("[chat vision payload] image optimization failed", error);
    throw new ChatServiceError(
      "CHAT_IMAGE_DECODE_FAILED",
      400,
      `无法读取图片「${attachment.name}」，请转换为常见 JPG、PNG 或 WebP 后重试。`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function prepareMessagesForLlmVision(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const prepared = await Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" && message.role !== "assistant") return message;
      return {
        ...message,
        parts: await Promise.all(message.parts.map(optimizeImagePart)),
      };
    }),
  );
  const payloadChars = prepared.reduce(
    (total, message) => total + message.parts.reduce(
      (subtotal, part) => subtotal + (part.type === "attachment" ? part.attachment.dataUrl.length : 0),
      0,
    ),
    0,
  );
  if (payloadChars > LLM_VISION_PAYLOAD_MAX_CHARS) {
    throw new ChatServiceError(
      "CHAT_VISION_PAYLOAD_TOO_LARGE",
      413,
      "本轮图片总量过大，请减少图片数量后重试。",
    );
  }
  return prepared;
}
