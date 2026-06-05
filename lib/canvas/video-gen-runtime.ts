import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasBoard, CanvasNode } from "@/lib/canvas/types";
import type { WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { prependVideoGalleryRecord } from "@/lib/db/video-gallery-store";
import { resolveMentions } from "@/lib/prompt-mention";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import {
  generateUnifiedVideo,
  type UnifiedVideoGenerationSuccess,
} from "@/lib/video-generation-service";
import {
  VIDEO_MODE_LABELS,
  getVideoCapabilities,
  getVideoModelDefinition,
  type UnifiedVideoGenerateRequest,
  type UnifiedVideoReference,
  type VideoGenerationModeId,
  type VideoModelId,
  type UiVideoModeId,
  inferEffectiveVideoMode,
} from "@/lib/video-workspace";

type CanvasVideoGenerationResult = {
  sourceNode: CanvasNode;
  galleryRecord: VideoGalleryRecord;
};

function mustBeVideoNode(node: CanvasNode | undefined): CanvasNode {
  if (!node || node.type !== "video") {
    throw new Error("目标节点不是视频节点");
  }
  return node;
}

function buildPrompt(board: CanvasBoard, node: CanvasNode): { prompt: string; resolvedNodeIds: string[] } {
  const ownPrompt = node.metadata?.prompt?.trim() ?? "";
  const { cleanedPrompt, resolvedNodeIds } = resolveMentions(ownPrompt, {
    canvasNodes: board.nodes,
  });

  const connectedPrompts = board.connections
    .filter((conn) => conn.toNodeId === node.id && conn.targetPort === "prompt")
    // 过滤掉已经在提示词内被显式 @ 引用过的文本节点 ID，避免重复拼接
    .filter((conn) => !resolvedNodeIds.includes(conn.fromNodeId))
    .map((conn) => board.nodes.find((item) => item.id === conn.fromNodeId))
    .filter((item): item is CanvasNode => Boolean(item))
    .filter((item) => item.type === "text")
    .map((item) => item.metadata?.text?.trim() ?? "")
    .filter(Boolean);

  const parts = [cleanedPrompt, ...connectedPrompts].filter(Boolean);
  if (parts.length === 0) {
    throw new Error("生视频节点缺少提示词：请填写节点提示词，或接入文本节点。");
  }
  return {
    prompt: parts.join("\n\n"),
    resolvedNodeIds,
  };
}

function findSourceNode(board: CanvasBoard, nodeId: string): CanvasNode | undefined {
  return board.nodes.find((item) => item.id === nodeId);
}

function getImageUrl(node: CanvasNode): string {
  const url = node.metadata?.imageUrl?.trim() || node.metadata?.previewImageUrl?.trim() || "";
  if (!url) throw new Error(`节点「${node.title || "图片"}」还没有图片。`);
  return url;
}

function getVideoUrl(node: CanvasNode): string {
  const url = node.metadata?.videoUrl?.trim() || node.metadata?.previewVideoUrl?.trim() || "";
  if (!url) throw new Error(`节点「${node.title || "视频"}」还没有视频。`);
  return url;
}

function collectReferences(board: CanvasBoard, node: CanvasNode): UnifiedVideoReference[] {
  const refs: UnifiedVideoReference[] = [];
  for (const conn of board.connections) {
    if (conn.toNodeId !== node.id) continue;
    const sourceNode = findSourceNode(board, conn.fromNodeId);
    if (!sourceNode) continue;
    switch (conn.targetPort) {
      case "firstFrame":
        if (sourceNode.type !== "image") throw new Error("首帧输入只能连接图片节点。");
        refs.push({ role: "start_frame", url: getImageUrl(sourceNode), label: sourceNode.title });
        break;
      case "lastFrame":
        if (sourceNode.type !== "image") throw new Error("尾帧输入只能连接图片节点。");
        refs.push({ role: "end_frame", url: getImageUrl(sourceNode), label: sourceNode.title });
        break;
      case "imageReference":
        if (sourceNode.type !== "image") throw new Error("参考图输入只能连接图片节点。");
        refs.push({ role: "image_reference", url: getImageUrl(sourceNode), label: sourceNode.title });
        break;
      case "videoReference":
        if (sourceNode.type !== "video") throw new Error("动作参考输入只能连接视频节点。");
        refs.push({ role: "motion_source_video", url: getVideoUrl(sourceNode), label: sourceNode.title });
        break;
      default:
        break;
    }
  }
  return refs;
}

function buildGalleryRecord(params: {
  result: UnifiedVideoGenerationSuccess;
  prompt: string;
  node: CanvasNode;
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  references: UnifiedVideoReference[];
}): VideoGalleryRecord {
  const model = getVideoModelDefinition(params.modelId);
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    modelId: params.modelId,
    modelName: model.label,
    modeId: params.modeId,
    modeName: VIDEO_MODE_LABELS[params.modeId],
    finalPrompt: params.prompt,
    aspectRatio: params.node.metadata?.videoAspectRatio,
    durationSeconds: params.node.metadata?.videoDurationSeconds ?? 5,
    resolution: params.node.metadata?.videoResolution,
    providerTaskId: params.result.providerTaskId,
    referencesSummary: params.references.map((item) => ({
      role: item.role,
      label: item.label || item.role,
      url: item.url,
    })),
    videoUrl: params.result.videoUrl,
    status: "success",
  };
}

export async function executeCanvasVideoGeneration(params: {
  supabase: SupabaseClient;
  userId: string;
  board: CanvasBoard;
  nodeId: string;
  workspaceSnapshot: WorkspaceSnapshot;
}): Promise<CanvasVideoGenerationResult> {
  const sourceNode = mustBeVideoNode(params.board.nodes.find((node) => node.id === params.nodeId));
  const modelId = sourceNode.metadata?.videoModelId ?? params.workspaceSnapshot.videoWorkspace.uiDefaults.defaultModelId;
  const modeId = sourceNode.metadata?.videoModeId ?? "text_to_video";
  const capabilities = getVideoCapabilities(modelId);
  
  // 核心：构建并清洗提示词，解析内联文本节点引用
  const { prompt } = buildPrompt(params.board, sourceNode);
  const references = collectReferences(params.board, sourceNode);

  const hasStartFrame = references.some((ref) => ref.role === "start_frame");
  const hasEndFrame = references.some((ref) => ref.role === "end_frame");

  let effectiveModeId: VideoGenerationModeId;
  if (modeId === "motion_control") {
    effectiveModeId = "motion_control";
  } else {
    const { modeId: inferredMode, error: modeError } = inferEffectiveVideoMode(
      modeId,
      hasStartFrame,
      hasEndFrame,
    );
    if (modeError) {
      throw new Error(modeError);
    }
    effectiveModeId = inferredMode;
  }

  const request: UnifiedVideoGenerateRequest = {
    modelId,
    modeId: effectiveModeId,
    prompt,
    durationSeconds: sourceNode.metadata?.videoDurationSeconds ?? capabilities.durations[0] ?? 5,
    aspectRatio: sourceNode.metadata?.videoAspectRatio ?? capabilities.aspectRatios[0],
    resolution: sourceNode.metadata?.videoResolution ?? capabilities.resolutions[0],
    references,
  };

  const result = await generateUnifiedVideo({
    supabase: params.supabase,
    userId: params.userId,
    workspaceSnapshot: params.workspaceSnapshot,
    request,
  });

  const nextSourceNode: CanvasNode = {
    ...sourceNode,
    metadata: {
      ...sourceNode.metadata,
      videoUrl: result.videoUrl,
      previewVideoUrl: result.videoUrl,
      videoModelId: modelId,
      videoModeId: modeId,
      videoAspectRatio: request.aspectRatio,
      videoResolution: request.resolution,
      videoDurationSeconds: request.durationSeconds,
      status: "success",
      lastRunAt: new Date().toISOString(),
      lastError: undefined,
    },
  };

  const galleryRecord = buildGalleryRecord({
    result,
    prompt,
    node: nextSourceNode,
    modelId,
    modeId: effectiveModeId,
    references,
  });
  await prependVideoGalleryRecord(params.supabase, galleryRecord);

  return {
    sourceNode: nextSourceNode,
    galleryRecord,
  };
}
