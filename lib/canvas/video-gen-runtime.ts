import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasBoard, CanvasNode } from "@/lib/canvas/types";
import type { WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { resolveMentions } from "@/lib/prompt-mention";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { VideoGenerationError, type UnifiedVideoGenerationSuccess } from "@/lib/video-generation-service";
import {
  releaseCreditReservation,
  reserveCreditsForQuote,
} from "@/lib/credits/accounts";
import { quoteVideoCredits } from "@/lib/credits/pricing";
import { assertCreditGenerationAllowed } from "@/lib/credits/risk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyBillableVideoReference } from "@/lib/video-reference-security";
import { createVideoGenerationJob, updateVideoJob } from "@/lib/video-jobs/repository";
import { submitCreatedVideoJob } from "@/lib/video-jobs/lifecycle";
import { updateCanvasBoard } from "@/lib/canvas/board-store";
import {
  VIDEO_MODE_LABELS,
  getVideoCapabilities,
  getVideoModelDefinition,
  getVideoParameterCapabilities,
  type UnifiedVideoGenerateRequest,
  type UnifiedVideoReference,
  type VideoGenerationModeId,
  type VideoModelId,
  inferEffectiveVideoMode,
} from "@/lib/video-workspace";

type CanvasVideoGenerationResult = {
  sourceNode: CanvasNode;
  jobId: string;
  status: "queued" | "submitted";
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
    .filter((item) => item.type === "text")
    .map((item) =>
      (item.metadata?.textMode === "chat"
        ? item.metadata.chatPreviewMarkdown || item.metadata.text
        : item.metadata?.text
      )?.trim() ?? ""
    )
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

function getVideoDurationSeconds(node: CanvasNode): number | undefined {
  const value = Number(node.metadata?.videoDurationSeconds);
  return Number.isFinite(value) && value > 0 ? value : undefined;
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
          durationSeconds: getVideoDurationSeconds(sourceNode),
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
        durationSeconds: item.durationSeconds,
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

function billableSecondsForCanvasVideo(modeId: VideoGenerationModeId, requestDurationSeconds: number, references: UnifiedVideoReference[]): number {
  if (modeId === "video_edit") {
    return references.find((ref) => ref.role === "video_reference" && Number.isFinite(ref.durationSeconds) && ref.durationSeconds! > 0)?.durationSeconds ?? 0;
  }
  if (modeId === "motion_control") {
    return references.find((ref) => ref.role === "motion_source_video" && Number.isFinite(ref.durationSeconds) && ref.durationSeconds! > 0)?.durationSeconds ?? 0;
  }
  return requestDurationSeconds;
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
  projectId?: string | null;
  requestId: string;
  callbackOrigin: string;
}): Promise<CanvasVideoGenerationResult> {
  const sourceNode = mustBeVideoNode(params.board.nodes.find((node) => node.id === params.nodeId));
  const modelId = sourceNode.metadata?.videoModelId ?? params.workspaceSnapshot.videoWorkspace.uiDefaults.defaultModelId;
  const modeId = sourceNode.metadata?.videoModeId ?? "text_to_video";
  const capabilities = getVideoCapabilities(modelId);
  
  // 核心：构建并清洗提示词，解析内联文本节点引用
  const promptInfo = buildPrompt(params.board, sourceNode);
  const { prompt } = promptInfo;
  const mentionedReferences = collectMentionedReferences(promptInfo);
  const unverifiedReferences = mentionedReferences.length > 0 ? mentionedReferences : collectReferences(params.board, sourceNode);

  const hasStartFrame = unverifiedReferences.some((ref) => ref.role === "start_frame");
  const hasEndFrame = unverifiedReferences.some((ref) => ref.role === "end_frame");

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

  const verifiedReference = await verifyBillableVideoReference({
    userId: params.userId,
    modeId: effectiveModeId,
    references: unverifiedReferences,
  });
  const references = verifiedReference.references;
  const parameterCapabilities = getVideoParameterCapabilities(modelId, effectiveModeId, references);
  const resolution = sourceNode.metadata?.videoResolution ?? parameterCapabilities.resolutions[0];
  if (!resolution) {
    throw new Error("当前视频模型没有可用分辨率配置。");
  }
  const requestDurationSeconds = parameterCapabilities.supportsDuration
    ? sourceNode.metadata?.videoDurationSeconds ?? capabilities.durations[0] ?? 5
    : 0;
  const request: UnifiedVideoGenerateRequest = {
    modelId,
    modeId: effectiveModeId,
    prompt,
    durationSeconds: requestDurationSeconds,
    aspectRatio: sourceNode.metadata?.videoAspectRatio ?? capabilities.aspectRatios[0],
    resolution,
    references,
  };
  await assertCreditGenerationAllowed(params.userId);
  const quote = await quoteVideoCredits(createSupabaseAdminClient(), {
    feature: "canvas_video",
    modelId,
    modeId: effectiveModeId,
    resolution,
    durationSeconds: billableSecondsForCanvasVideo(effectiveModeId, request.durationSeconds, references),
  });
  const reservation = await reserveCreditsForQuote({
    userId: params.userId,
    projectId: params.projectId,
    requestId: params.requestId,
    quote,
    metadata: {
      boardId: params.board.id,
      nodeId: sourceNode.id,
      promptLength: prompt.length,
      referenceCount: references.length,
    },
  });

  const admin = createSupabaseAdminClient();
  const galleryRecord = buildGalleryRecord({
    result: { providerTaskId: "", videoUrl: "" },
    prompt,
    node: sourceNode,
    modelId,
    modeId: effectiveModeId,
    references,
  });
  const created = await createVideoGenerationJob({
    admin,
    userId: params.userId,
    projectId: params.projectId ?? null,
    requestId: params.requestId,
    reservationId: reservation.id,
    snapshot: {
      request,
      galleryRecord,
      canvas: { boardId: params.board.id, nodeId: sourceNode.id },
    },
  });
  const nextSourceNode: CanvasNode = {
    ...sourceNode,
    metadata: {
      ...sourceNode.metadata,
      videoJobId: created.job.id,
      videoModelId: modelId,
      videoModeId: modeId,
      videoAspectRatio: request.aspectRatio,
      videoResolution: request.resolution,
      videoDurationSeconds: request.durationSeconds,
      status: "running",
      lastRunAt: new Date().toISOString(),
      lastError: undefined,
    },
  };
  await updateCanvasBoard(admin, params.board.id, {
    data: {
      nodes: params.board.nodes.map((node) => node.id === sourceNode.id ? nextSourceNode : node),
      connections: params.board.connections,
      viewport: params.board.viewport,
      snapToGrid: params.board.snapToGrid,
    },
  }, params.projectId === undefined ? {} : { projectId: params.projectId });
  if (!created.created) {
    return { sourceNode: nextSourceNode, jobId: created.job.id, status: created.job.status === "queued" ? "queued" : "submitted" };
  }
  const callbackUrl = `${params.callbackOrigin.replace(/\/+$/, "")}/api/video/jobs/${created.job.id}/callback?token=${encodeURIComponent(created.callbackToken)}`;
  try {
    const submitted = await submitCreatedVideoJob(admin, created.job, callbackUrl);
    return { sourceNode: nextSourceNode, jobId: submitted.id, status: submitted.status === "queued" ? "queued" : "submitted" };
  } catch (error) {
    const safeToRelease = error instanceof VideoGenerationError && error.code === "provider_submit_failed";
    if (safeToRelease) {
      await releaseCreditReservation({ reservationId: reservation.id, reason: error.message, metadata: { videoJobId: created.job.id } });
    }
    await updateVideoJob(admin, created.job.id, {
      status: safeToRelease ? "failed" : "needs_review",
      billing_status: safeToRelease ? "released" : "needs_review",
      error: { message: error instanceof Error ? error.message : "canvas_video_submission_failed" },
      completed_at: safeToRelease ? new Date().toISOString() : null,
      next_poll_at: null,
    });
    throw error;
  }
}
