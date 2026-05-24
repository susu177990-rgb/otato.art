import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateImage } from "@/lib/image-generate";
import { persistGeneratedImageToStorage } from "@/lib/db/persist-generated-image";
import { prependGalleryRecord } from "@/lib/db/gallery-store";
import {
  buildImageModelCatalog,
  effectiveAgentImageModelId,
  resolveImageModelSettings,
} from "@/lib/chat/image-model-catalog";
import type { ConversationAttachmentEntry } from "@/lib/chat/types";
import type {
  GptImageQuality,
  ImageAspectRatio,
  ImageGalleryRecord,
  ImageModelId,
  ImageSizeTier,
  ImageWorkspaceSettings,
} from "@/lib/image-workspace";

export interface AgentToolContext {
  attachmentsById: Record<string, ConversationAttachmentEntry>;
  imageWorkspace: ImageWorkspaceSettings;
  defaultImageModelId: ImageModelId;
  /** 对话生图结果上传到 Storage；未提供时仅返回上游临时地址 */
  supabase?: SupabaseClient;
  userId?: string;
}

function resolveRefUrls(
  urls: string[],
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): string[] {
  return urls.map((u) => {
    const t = u.trim();
    if (!t) return t;
    if (attachmentsById[t]?.dataUrl) return attachmentsById[t].dataUrl;
    const stripped = t.startsWith("convatt:") ? t.slice("convatt:".length).trim() : t;
    if (attachmentsById[stripped]?.dataUrl) return attachmentsById[stripped].dataUrl;
    return t;
  });
}

function approxBytesFromDataUrl(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  if (idx === -1) return dataUrl.length;
  const b64 = dataUrl.slice(idx + 1).replace(/\s/g, "");
  return Math.floor((b64.length * 3) / 4);
}

export async function executeAgentTool(
  toolName: string,
  argsJson: string,
  ctx: AgentToolContext,
): Promise<string> {
  const { attachmentsById, imageWorkspace } = ctx;
  try {
    switch (toolName) {
      case "list_saved_models":
        return JSON.stringify(
          { success: true, models: buildImageModelCatalog(imageWorkspace) },
          null,
          2,
        );
      case "list_conversation_attachments":
        return toolListConversationAttachments(attachmentsById);
      case "get_attachment":
        return toolGetAttachment(argsJson, attachmentsById);
      case "generate_image":
        return await toolGenerateImage(argsJson, ctx);
      default:
        return JSON.stringify({ success: false, error: `未知工具: ${toolName}` });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ success: false, error: message });
  }
}

function toolListConversationAttachments(
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): string {
  const list = Object.values(attachmentsById).sort((a, b) => a.createdAt - b.createdAt);
  const slim = list.map((e) => ({
    attachment_id: e.id,
    message_id: e.messageId,
    name: e.name,
    mime: e.mime,
    kind: e.kind,
    approx_bytes: approxBytesFromDataUrl(e.dataUrl),
  }));
  return JSON.stringify({ success: true, count: slim.length, attachments: slim }, null, 2);
}

function toolGetAttachment(
  argsJson: string,
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): string {
  let attachment_id: string;
  try {
    attachment_id = JSON.parse(argsJson || "{}").attachment_id?.trim();
  } catch {
    return JSON.stringify({ success: false, error: "get_attachment 需要合法 JSON" });
  }
  if (!attachment_id) {
    return JSON.stringify({ success: false, error: "attachment_id 必填" });
  }
  const e = attachmentsById[attachment_id];
  if (!e) {
    return JSON.stringify({
      success: false,
      error: `未找到附件「${attachment_id}」，请先 list_conversation_attachments`,
    });
  }
  return JSON.stringify(
    {
      success: true,
      attachment_id: e.id,
      message_id: e.messageId,
      name: e.name,
      mime: e.mime,
      kind: e.kind,
      approx_bytes: approxBytesFromDataUrl(e.dataUrl),
      hint:
        "调用 generate_image 时，在 ref_image_urls 数组中直接传入该 attachment_id 字符串即可，客户端会自动展开为 data URL。",
    },
    null,
    2,
  );
}

async function toolGenerateImage(argsJson: string, ctx: AgentToolContext): Promise<string> {
  let args: {
    preset_id?: string;
    prompt?: string;
    aspect_ratio?: ImageAspectRatio;
    image_size?: ImageSizeTier;
    image_quality?: GptImageQuality;
    ref_image_urls?: string[];
  };
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return JSON.stringify({ success: false, error: "generate_image 参数不是合法 JSON" });
  }

  const presetId = effectiveAgentImageModelId(args.preset_id, ctx.defaultImageModelId);
  const prompt = args.prompt?.trim();
  if (!prompt) {
    return JSON.stringify({ success: false, error: "prompt 必填" });
  }

  const model = resolveImageModelSettings(ctx.imageWorkspace, presetId as ImageModelId);
  if (!model) {
    return JSON.stringify({
      success: false,
      error: `preset_id 对应模型未配置完整: ${presetId}。请先 list_saved_models。`,
    });
  }

  const rawRefs = Array.isArray(args.ref_image_urls) ? args.ref_image_urls.filter(Boolean) : [];
  const refImages = resolveRefUrls(rawRefs, ctx.attachmentsById);

  const gptQ = args.image_quality;
  const gptImageQuality: GptImageQuality | undefined =
    gptQ === "auto" || gptQ === "low" || gptQ === "medium" || gptQ === "high" ? gptQ : undefined;

  const { imageUrl } = await generateImage({
    model,
    prompt,
    aspectRatio: args.aspect_ratio || "auto",
    imageSize: args.image_size || "1K",
    gptImageQuality,
    refImages,
  });

  const imageId = randomUUID();
  let mediaUrl = imageUrl;
  if (ctx.supabase && ctx.userId) {
    mediaUrl = await persistGeneratedImageToStorage(
      ctx.supabase,
      ctx.userId,
      imageUrl,
      imageId,
    );

    const galleryRecord: ImageGalleryRecord = {
      id: imageId,
      createdAt: new Date().toISOString(),
      modeId: "chat-agent",
      modeName: "对话生图",
      modelId: presetId as ImageModelId,
      modelName: model.modelName,
      finalPrompt: prompt,
      userInput: prompt,
      aspectRatio: args.aspect_ratio || "auto",
      imageSize: args.image_size || "1K",
      gptImageQuality,
      imageUrl: mediaUrl,
      refImageCount: rawRefs.length,
      status: "success",
    };
    prependGalleryRecord(ctx.supabase, galleryRecord).catch((e) =>
      console.warn("[chat/agent gallery save]", e),
    );
  }

  return JSON.stringify({
    success: true,
    kind: "image",
    media_url: mediaUrl,
    preset_id: presetId,
  });
}
