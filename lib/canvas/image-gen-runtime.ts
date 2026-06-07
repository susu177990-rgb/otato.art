import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasBoard, CanvasNode } from "@/lib/canvas/types";
import type { ImageAspectRatio, ImageGalleryRecord, ImageModelSettings } from "@/lib/image-workspace";
import type { WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { generateImage } from "@/lib/image-generate";
import { persistGeneratedImageToStorage } from "@/lib/db/persist-generated-image";
import { prependGalleryRecord } from "@/lib/db/gallery-store";
import { resolveMentions } from "@/lib/prompt-mention";



type CanvasImageGenerationResult = {
  sourceNode: CanvasNode;
  galleryRecord: ImageGalleryRecord;
};

function mustBeImageNode(node: CanvasNode | undefined): CanvasNode {
  if (!node || node.type !== "image") {
    throw new Error("目标节点不是图片节点");
  }
  return node;
}

function resolveImageModel(snapshot: WorkspaceSnapshot, node: CanvasNode): ImageModelSettings {
  const modelId = node.metadata?.imageModelId ?? "gpt-image-2";
  const model = snapshot.imageWorkspace.models[modelId];
  if (!model?.endpointUrl?.trim() || !model.apiKey?.trim() || !model.modelName?.trim()) {
    throw new Error(`生图模型「${model?.label ?? modelId}」未配置完整，请先到设置页填写 Endpoint / API Key / 模型名。`);
  }
  return model;
}

function buildPrompt(board: CanvasBoard, node: CanvasNode): ReturnType<typeof resolveMentions> & { prompt: string } {
  const ownPrompt = node.metadata?.prompt?.trim() ?? "";
  const mentionResult = resolveMentions(ownPrompt, {
    canvasNodes: board.nodes,
  });
  const { cleanedPrompt, resolvedNodeIds } = mentionResult;

  const connectedPrompts = board.connections
    .filter((conn) => conn.toNodeId === node.id && conn.targetPort === "prompt")
    // 过滤掉已经在提示词内被显式 @ 引用过的文本节点 ID，避免重复拼接
    .filter((conn) => !resolvedNodeIds.includes(conn.fromNodeId))
    .map((conn) => board.nodes.find((item) => item.id === conn.fromNodeId))
    .filter((item): item is CanvasNode => Boolean(item))
    .filter((item) => item.type === "text" || item.type === "preset")
    .map((item) => {
      if (item.type === "preset") {
        return item.metadata?.prompt?.trim() ?? "";
      }
      return (
        (item.metadata?.textMode === "chat"
          ? item.metadata.chatPreviewMarkdown || item.metadata.text
          : item.metadata?.text
        )?.trim() ?? ""
      );
    })
    .filter(Boolean);

  const parts = [cleanedPrompt, ...connectedPrompts].filter(Boolean);
  if (parts.length === 0) {
    throw new Error("生图节点缺少提示词：请填写节点提示词，或接入文本节点。");
  }
  return {
    ...mentionResult,
    prompt: parts.join("\n\n"),
  };
}

function resolveReferenceImageUrl(board: CanvasBoard, sourceNode: CanvasNode): string {
  if (sourceNode.type === "image") {
    const url = sourceNode.metadata?.imageUrl?.trim() || sourceNode.metadata?.previewImageUrl?.trim();
    if (url) return url;
    throw new Error(`参考节点「${sourceNode.title || "图片"}」还没有图片。`);
  }
  throw new Error(`节点「${sourceNode.title || "未命名节点"}」不能作为生图参考图。`);
}

function collectReferenceImages(board: CanvasBoard, node: CanvasNode): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const conn of board.connections) {
    if (conn.toNodeId !== node.id || conn.targetPort !== "imageReference") continue;
    const sourceNode = board.nodes.find((item) => item.id === conn.fromNodeId);
    if (!sourceNode) continue;
    const url = resolveReferenceImageUrl(board, sourceNode);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function collectMentionedReferenceImages(promptInfo: ReturnType<typeof buildPrompt>): string[] {
  const missingImageMention = promptInfo.resolution.mentions.find(
    (mention) => mention.candidate?.type === "node" && mention.candidate.nodeType === "image" && !mention.candidate.url,
  );
  if (missingImageMention) {
    throw new Error(`参考节点「${missingImageMention.label}」还没有图片。`);
  }
  const urls = promptInfo.mentionedReferences
    .filter((item) => item.type === "image")
    .map((item) => item.url)
    .filter(Boolean);
  return Array.from(new Set(urls));
}



function estimateOutputSize(aspectRatio: ImageAspectRatio | undefined): {
  width: number;
  height: number;
  naturalWidth?: number;
  naturalHeight?: number;
} {
  switch (aspectRatio) {
    case "1:1":
      return { width: 300, height: 300, naturalWidth: 1024, naturalHeight: 1024 };
    case "2:3":
      return { width: 256, height: 384, naturalWidth: 1024, naturalHeight: 1536 };
    case "3:2":
      return { width: 360, height: 240, naturalWidth: 1536, naturalHeight: 1024 };
    case "3:4":
      return { width: 270, height: 360, naturalWidth: 1024, naturalHeight: 1365 };
    case "4:3":
      return { width: 360, height: 270, naturalWidth: 1365, naturalHeight: 1024 };
    case "9:16":
      return { width: 216, height: 384, naturalWidth: 1080, naturalHeight: 1920 };
    case "16:9":
      return { width: 384, height: 216, naturalWidth: 1920, naturalHeight: 1080 };
    case "21:9":
      return { width: 384, height: 165, naturalWidth: 2100, naturalHeight: 900 };
    case "auto":
    default:
      return { width: 320, height: 240 };
  }
}

function buildGalleryRecord(params: {
  imageUrl: string;
  model: ImageModelSettings;
  sourceNode: CanvasNode;
  prompt: string;
  refImageCount: number;
}): ImageGalleryRecord {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    modeId: "canvas",
    modeName: "无限画布",
    modelId: params.model.id,
    modelName: params.model.modelName,
    finalPrompt: params.prompt,
    userInput: params.sourceNode.metadata?.prompt?.trim() || params.prompt,
    userSlotInputs: [params.prompt],
    aspectRatio: params.sourceNode.metadata?.aspectRatio ?? "4:3",
    imageSize: params.sourceNode.metadata?.imageSize ?? "1K",
    gptImageQuality: params.model.provider === "gpt-image" ? params.sourceNode.metadata?.gptImageQuality : undefined,
    imageUrl: params.imageUrl,
    refImageCount: params.refImageCount,
    status: "success",
  };
}

export async function executeCanvasImageGeneration(params: {
  supabase: SupabaseClient;
  userId: string;
  board: CanvasBoard;
  nodeId: string;
  workspaceSnapshot: WorkspaceSnapshot;
}): Promise<CanvasImageGenerationResult> {
  const sourceNode = mustBeImageNode(params.board.nodes.find((node) => node.id === params.nodeId));
  const model = resolveImageModel(params.workspaceSnapshot, sourceNode);
  
  // 核心：构建并清洗提示词，解析内联文本节点引用
  const promptInfo = buildPrompt(params.board, sourceNode);
  const { prompt } = promptInfo;
  const mentionedRefImages = collectMentionedReferenceImages(promptInfo);
  const refImages = mentionedRefImages.length > 0 ? mentionedRefImages : collectReferenceImages(params.board, sourceNode);

  const result = await generateImage({
    model,
    prompt,
    aspectRatio: sourceNode.metadata?.aspectRatio ?? "4:3",
    imageSize: sourceNode.metadata?.imageSize ?? "1K",
    gptImageQuality: model.provider === "gpt-image" ? sourceNode.metadata?.gptImageQuality : undefined,
    refImages,
  });

  const imageUrl = await persistGeneratedImageToStorage(params.supabase, params.userId, result.imageUrl, randomUUID());

  const size = estimateOutputSize(sourceNode.metadata?.aspectRatio);

  // Update the source node directly — no separate output node
  const nextSourceNode: CanvasNode = {
    ...sourceNode,
    width: size.width,
    height: size.height,
    metadata: {
      ...sourceNode.metadata,
      imageUrl,
      previewImageUrl: imageUrl,
      status: "success",
      lastRunAt: new Date().toISOString(),
      lastError: undefined,
      naturalWidth: size.naturalWidth,
      naturalHeight: size.naturalHeight,
    },
  };
  const galleryRecord = buildGalleryRecord({
    imageUrl,
    model,
    sourceNode: nextSourceNode,
    prompt,
    refImageCount: refImages.length,
  });
  await prependGalleryRecord(params.supabase, galleryRecord);

  return {
    sourceNode: nextSourceNode,
    galleryRecord,
  };
}
