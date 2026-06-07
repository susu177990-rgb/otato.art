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
    throw new Error("生视频节点缺少提示词：请填写节点提示词，或接入文本节点。");
  }
  return {
    ...mentionResult,
    prompt: parts.join("\n\n"),
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

function getAudioUrl(node: CanvasNode): string {
  const url = node.metadata?.audioUrl?.trim() || "";
  if (!url) throw new Error(`节点「${node.title || "音频"}」还没有音频。`);
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
        refs.push({
          role: node.metadata?.videoModeId === "multi_image_reference" ? "video_reference" : "motion_source_video",
          url: getVideoUrl(sourceNode),
          label: sourceNode.title,
        });
        break;
      case "audioReference":
        if (sourceNode.type !== "audio") throw new Error("音频参考输入只能连接音频节点。");
        refs.push({ role: "audio_reference", url: getAudioUrl(sourceNode), label: sourceNode.title });
        break;
      default:
        break;
    }
  }
  return refs;
}

function collectMentionedReferences(promptInfo: ReturnType<typeof buildPrompt>): UnifiedVideoReference[] {
  const missingMediaMention = promptInfo.resolution.mentions.find(
    (mention) =>
      mention.candidate?.type === "node" &&
      (mention.candidate.nodeType === "image" || mention.candidate.nodeType === "video" || mention.candidate.nodeType === "audio") &&
      !mention.candidate.url,
  );
  if (missingMediaMention) {
    throw new Error(`参考节点「${missingMediaMention.label}」还没有可用媒体。`);
  }

  const refs = promptInfo.mentionedReferences.map((item): UnifiedVideoReference | null => {
    if (item.type === "video") {
      return {
        role: item.role === "video_reference" ? "video_reference" : "motion_source_video",
        url: item.url,
        label: item.label,
      };
    }
    if (item.type === "audio") return { role: "audio_reference", url: item.url, label: item.label };
    if (item.role === "start_frame") return { role: "start_frame", url: item.url, label: item.label };
    if (item.role === "end_frame") return { role: "end_frame", url: item.url, label: item.label };
    return { role: "image_reference", url: item.url, label: item.label };
  });

  const seen = new Set<string>();
  return refs.filter((ref): ref is UnifiedVideoReference => {
    if (!ref) return false;
    const key = `${ref.role}:${ref.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const promptInfo = buildPrompt(params.board, sourceNode);
  const { prompt } = promptInfo;
  const mentionedReferences = collectMentionedReferences(promptInfo);
  const references = mentionedReferences.length > 0 ? mentionedReferences : collectReferences(params.board, sourceNode);

  const hasStartFrame = references.some((ref) => ref.role === "start_frame");
  const hasEndFrame = references.some((ref) => ref.role === "end_frame");

  let effectiveModeId: VideoGenerationModeId;
  if (mentionedReferences.some((ref) => ref.role === "motion_source_video")) {
    effectiveModeId = "motion_control";
  } else if (mentionedReferences.some((ref) => ref.role === "image_reference" || ref.role === "video_reference" || ref.role === "audio_reference")) {
    effectiveModeId = "multi_image_reference";
  } else if (modeId === "motion_control") {
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
