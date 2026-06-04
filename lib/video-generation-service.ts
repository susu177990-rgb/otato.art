import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistGeneratedVideoToStorage } from "@/lib/db/persist-generated-video";
import type { WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import {
  getVideoCapabilities,
  getVideoModelDefinition,
  type UnifiedVideoGenerateRequest,
  type UnifiedVideoReference,
  type VideoModelId,
  type VideoModelSettings,
  type VideoProviderOptions,
} from "@/lib/video-workspace";

type ProviderTaskResult = {
  providerTaskId: string;
  remoteVideoUrl: string;
};

type ProviderSubmitContext = {
  modelId: VideoModelId;
  modelDefinition: ReturnType<typeof getVideoModelDefinition>;
  modelSettings: VideoModelSettings;
  request: UnifiedVideoGenerateRequest;
};

type ProviderAdapter = {
  submit: (ctx: ProviderSubmitContext) => Promise<ProviderTaskResult>;
};

export type UnifiedVideoGenerationSuccess = {
  providerTaskId: string;
  videoUrl: string;
};

export class VideoGenerationError extends Error {
  code:
    | "invalid_mode"
    | "model_not_configured"
    | "unsupported_capability"
    | "provider_submit_failed"
    | "provider_poll_failed"
    | "provider_timeout"
    | "result_missing"
    | "storage_persist_failed"
    | "contract_pending";

  constructor(
    code: VideoGenerationError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function assertConfiguredModel(model: VideoModelSettings, modelId: VideoModelId) {
  if (!model.enabled) {
    throw new VideoGenerationError("model_not_configured", `模型「${model.label || modelId}」当前未启用。`);
  }
  if (!model.baseUrl.trim() || !model.apiKey.trim() || !model.apiModelName.trim()) {
    throw new VideoGenerationError(
      "model_not_configured",
      `模型「${model.label || modelId}」未配置完整，请先填写 Base URL / API Key / API Model Name。`,
    );
  }
}

function dedupeReferences(references: UnifiedVideoReference[]): UnifiedVideoReference[] {
  const seen = new Set<string>();
  return references.filter((item) => {
    const key = `${item.role}:${item.url.trim()}`;
    if (!item.url.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countRole(references: UnifiedVideoReference[], role: UnifiedVideoReference["role"]): number {
  return references.filter((item) => item.role === role).length;
}

export function validateUnifiedVideoRequest(request: UnifiedVideoGenerateRequest) {
  const capabilities = getVideoCapabilities(request.modelId);
  if (!capabilities.supportedModes.includes(request.modeId)) {
    throw new VideoGenerationError("invalid_mode", "当前模型不支持该生成模式。");
  }
  if (!request.prompt.trim()) {
    throw new VideoGenerationError("invalid_mode", "提示词不能为空。");
  }
  if (!capabilities.durations.includes(request.durationSeconds)) {
    throw new VideoGenerationError("invalid_mode", `当前模型不支持 ${request.durationSeconds}s 时长。`);
  }
  if (request.aspectRatio && !capabilities.aspectRatios.includes(request.aspectRatio)) {
    throw new VideoGenerationError("invalid_mode", `当前模型不支持 ${request.aspectRatio} 比例。`);
  }
  if (request.resolution && !capabilities.resolutions.includes(request.resolution)) {
    throw new VideoGenerationError("invalid_mode", `当前模型不支持 ${request.resolution} 分辨率。`);
  }

  const references = dedupeReferences(request.references);
  const startFrameCount = countRole(references, "start_frame");
  const endFrameCount = countRole(references, "end_frame");
  const imageRefCount = countRole(references, "image_reference");
  const motionSourceCount = countRole(references, "motion_source_video");

  if (startFrameCount > 1 || endFrameCount > 1 || motionSourceCount > 1) {
    throw new VideoGenerationError("invalid_mode", "首帧、尾帧或动作参考视频只能各提供一个。");
  }

  if (imageRefCount > capabilities.maxImageReferences) {
    throw new VideoGenerationError(
      "unsupported_capability",
      `当前模型最多只支持 ${capabilities.maxImageReferences} 张参考图。`,
    );
  }

  switch (request.modeId) {
    case "text_to_video":
      if (references.length > 0) {
        throw new VideoGenerationError("invalid_mode", "文生视频模式不接收参考素材。");
      }
      break;
    case "start_frame":
      if (startFrameCount !== 1 || endFrameCount !== 0 || imageRefCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "首帧模式需要且只需要 1 张首帧图。");
      }
      break;
    case "start_end_frame":
      if (!capabilities.supportsFirstLastFrames) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持首尾帧模式。");
      }
      if (startFrameCount !== 1 || endFrameCount !== 1 || imageRefCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "首尾帧模式需要 1 张首帧图和 1 张尾帧图。");
      }
      break;
    case "multi_image_reference":
      if (!capabilities.supportsMultipleImageReferences) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持多图参考模式。");
      }
      if (imageRefCount < 1 || startFrameCount !== 0 || endFrameCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "多图参考模式需要 1-N 张参考图，且不接收动作视频。");
      }
      break;
    case "motion_control":
      if (!capabilities.supportsMotionControl) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持动作控制模式。");
      }
      if (motionSourceCount !== 1 || endFrameCount !== 0 || imageRefCount > 0) {
        throw new VideoGenerationError("invalid_mode", "动作控制模式需要 1 个动作参考视频，可选 1 张首帧图。");
      }
      if (startFrameCount > 1) {
        throw new VideoGenerationError("invalid_mode", "动作控制模式最多只支持 1 张首帧图。");
      }
      break;
    default:
      break;
  }

  return { ...request, references };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

function defaultStatusPath(modelId: VideoModelId, options: VideoProviderOptions): string {
  if (typeof options.statusPath === "string" && options.statusPath.trim()) return options.statusPath.trim();
  if (modelId === "seedance-1.5") return "/status";
  return "/status";
}

async function submitSeedance(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  const { modelId, modelSettings, request } = ctx;
  const isV15 = modelId === "seedance-1.5";
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const imageReferences = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url);
  const images = startFrame ? [startFrame.url] : imageReferences;
  const createPayload = isV15
    ? {
        prompt: request.prompt,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution ?? "720p",
        duration: String(request.durationSeconds),
        generate_audio: Boolean(modelSettings.providerOptions.generateAudio),
        fixed_lens: Boolean(modelSettings.providerOptions.fixedLens),
        image_urls: images.length > 0 ? images.slice(0, 1) : undefined,
      }
    : {
        prompt: request.prompt,
        aspect_ratio: request.aspectRatio,
        duration: request.durationSeconds,
        model: modelSettings.apiModelName,
        images: images.length > 0 ? images : undefined,
      };
  const submitPath = typeof modelSettings.providerOptions.submitPath === "string" && modelSettings.providerOptions.submitPath.trim()
    ? modelSettings.providerOptions.submitPath.trim()
    : "/generate";
  let submitRes: Response;
  try {
    submitRes = await fetch(buildUrl(modelSettings.baseUrl, submitPath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelSettings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    });
  } catch (error) {
    throw new VideoGenerationError("provider_submit_failed", error instanceof Error ? error.message : "提交任务失败");
  }

  const submitData = (await submitRes.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    data?: { task_id?: string };
  };
  if (!submitRes.ok) {
    throw new VideoGenerationError(
      "provider_submit_failed",
      String(submitData.error || submitData.message || "提交任务失败"),
    );
  }
  const providerTaskId = String(submitData.data?.task_id ?? "").trim();
  if (!providerTaskId) {
    throw new VideoGenerationError("provider_submit_failed", "上游未返回任务 ID。");
  }

  const statusPath = defaultStatusPath(modelId, modelSettings.providerOptions);
  const timeoutMs = Number(modelSettings.providerOptions.timeoutMs) || 6 * 60_000;
  const intervalMs = Number(modelSettings.providerOptions.intervalMs) || 1800;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new VideoGenerationError("provider_timeout", "任务超时，请稍后重试。");
    }
    let statusRes: Response;
    try {
      statusRes = await fetch(
        `${buildUrl(modelSettings.baseUrl, statusPath)}?task_id=${encodeURIComponent(providerTaskId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${modelSettings.apiKey}` },
          cache: "no-store",
        },
      );
    } catch (error) {
      throw new VideoGenerationError("provider_poll_failed", error instanceof Error ? error.message : "查询任务失败");
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      data?: { status?: string; response?: string[]; error_message?: string | null };
    };
    if (!statusRes.ok) {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(statusData.error || statusData.message || "查询任务失败"),
      );
    }
    const status = String(statusData.data?.status ?? "").trim().toUpperCase();
    if (status === "SUCCESS") {
      const remoteVideoUrl = String(statusData.data?.response?.[0] ?? "").trim();
      if (!remoteVideoUrl) {
        throw new VideoGenerationError("result_missing", "任务完成但未返回视频地址。");
      }
      return { providerTaskId, remoteVideoUrl };
    }
    if (status === "FAILED") {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(statusData.data?.error_message ?? "任务失败"),
      );
    }
    await wait(intervalMs);
  }
}

function buildKlingCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferences = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url);
  const motionSource = request.references.find((item) => item.role === "motion_source_video");
  return {
    prompt: request.prompt,
    model_name: apiModelName,
    mode: request.modeId,
    duration: request.durationSeconds,
    aspect_ratio: request.aspectRatio,
    resolution: request.resolution,
    start_frame_url: startFrame?.url,
    end_frame_url: endFrame?.url,
    image_reference_urls: imageReferences.length > 0 ? imageReferences : undefined,
    motion_video_url: motionSource?.url,
  };
}

async function submitGenericTaskApi(
  ctx: ProviderSubmitContext,
  payload: Record<string, unknown>,
): Promise<ProviderTaskResult> {
  const { modelSettings } = ctx;
  const submitPath = typeof modelSettings.providerOptions.submitPath === "string" && modelSettings.providerOptions.submitPath.trim()
    ? modelSettings.providerOptions.submitPath.trim()
    : "/generate";
  const statusPath = typeof modelSettings.providerOptions.statusPath === "string" && modelSettings.providerOptions.statusPath.trim()
    ? modelSettings.providerOptions.statusPath.trim()
    : "/status";

  let submitRes: Response;
  try {
    submitRes = await fetch(buildUrl(modelSettings.baseUrl, submitPath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelSettings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new VideoGenerationError("provider_submit_failed", error instanceof Error ? error.message : "提交任务失败");
  }
  const submitData = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!submitRes.ok) {
    throw new VideoGenerationError(
      "provider_submit_failed",
      String(submitData.error || submitData.message || submitData.msg || "提交任务失败"),
    );
  }

  const providerTaskId = String(
    submitData.task_id ||
      submitData.id ||
      (submitData.data && typeof submitData.data === "object" && "task_id" in submitData.data ? (submitData.data as { task_id?: unknown }).task_id : "") ||
      "",
  ).trim();
  if (!providerTaskId) {
    throw new VideoGenerationError("provider_submit_failed", "上游未返回任务 ID。");
  }

  const timeoutMs = Number(modelSettings.providerOptions.timeoutMs) || 10 * 60_000;
  const intervalMs = Number(modelSettings.providerOptions.intervalMs) || 3000;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new VideoGenerationError("provider_timeout", "任务超时，请稍后重试。");
    }
    let statusRes: Response;
    try {
      statusRes = await fetch(
        `${buildUrl(modelSettings.baseUrl, statusPath)}?task_id=${encodeURIComponent(providerTaskId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${modelSettings.apiKey}` },
          cache: "no-store",
        },
      );
    } catch (error) {
      throw new VideoGenerationError("provider_poll_failed", error instanceof Error ? error.message : "查询任务失败");
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!statusRes.ok) {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(statusData.error || statusData.message || statusData.msg || "查询任务失败"),
      );
    }
    const container = statusData.data && typeof statusData.data === "object" ? statusData.data as Record<string, unknown> : statusData;
    const status = String(container.status || container.state || "").trim().toUpperCase();
    if (status === "SUCCESS" || status === "SUCCEEDED" || status === "DONE" || status === "COMPLETED") {
      const remoteVideoUrl = String(
        container.video_url ||
          container.url ||
          container.result_url ||
          (Array.isArray(container.response) ? container.response[0] : "") ||
          "",
      ).trim();
      if (!remoteVideoUrl) {
        throw new VideoGenerationError("result_missing", "任务完成但未返回视频地址。");
      }
      return { providerTaskId, remoteVideoUrl };
    }
    if (status === "FAILED" || status === "ERROR") {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(container.error_message || container.error || container.message || "任务失败"),
      );
    }
    await wait(intervalMs);
  }
}

async function submitKling(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitGenericTaskApi(ctx, buildKlingCreatePayload(ctx.request, ctx.modelSettings.apiModelName));
}

function buildVeoCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferences = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => ({ imageUri: item.url }));
  return {
    model: apiModelName,
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    durationSeconds: request.durationSeconds,
    resolution: request.resolution,
    image: startFrame ? { imageUri: startFrame.url } : undefined,
    firstFrame: startFrame ? { imageUri: startFrame.url } : undefined,
    lastFrame: endFrame ? { imageUri: endFrame.url } : undefined,
    referenceImages: imageReferences.length > 0 ? imageReferences : undefined,
  };
}

async function submitVeo(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitGenericTaskApi(ctx, buildVeoCreatePayload(ctx.request, ctx.modelSettings.apiModelName));
}

async function submitGeminiOmni(): Promise<ProviderTaskResult> {
  throw new VideoGenerationError("contract_pending", "Gemini Omni 当前仅做独立占位，待可信 API 契约确认后再开放提交。");
}

export function buildVideoCreatePayloadForTest(ctx: ProviderSubmitContext): Record<string, unknown> {
  switch (ctx.modelDefinition.provider) {
    case "seedance":
      if (ctx.modelId === "seedance-1.5") {
        const startFrame = ctx.request.references.find((item) => item.role === "start_frame");
        return {
          prompt: ctx.request.prompt,
          aspect_ratio: ctx.request.aspectRatio,
          resolution: ctx.request.resolution ?? "720p",
          duration: String(ctx.request.durationSeconds),
          generate_audio: Boolean(ctx.modelSettings.providerOptions.generateAudio),
          fixed_lens: Boolean(ctx.modelSettings.providerOptions.fixedLens),
          image_urls: startFrame ? [startFrame.url] : undefined,
        };
      }
      return {
        prompt: ctx.request.prompt,
        aspect_ratio: ctx.request.aspectRatio,
        duration: ctx.request.durationSeconds,
        model: ctx.modelSettings.apiModelName,
        images: ctx.request.references.map((item) => item.url),
      };
    case "kling":
      return buildKlingCreatePayload(ctx.request, ctx.modelSettings.apiModelName);
    case "veo":
      return buildVeoCreatePayload(ctx.request, ctx.modelSettings.apiModelName);
    case "gemini-omni":
      return {
        model: ctx.modelSettings.apiModelName,
        contractState: "pending",
        prompt: ctx.request.prompt,
      };
    default:
      return {};
  }
}

const PROVIDER_ADAPTERS: Record<ReturnType<typeof getVideoModelDefinition>["provider"], ProviderAdapter> = {
  seedance: { submit: submitSeedance },
  kling: { submit: submitKling },
  veo: { submit: submitVeo },
  "gemini-omni": { submit: submitGeminiOmni },
};

export async function generateUnifiedVideo(params: {
  supabase: SupabaseClient;
  userId: string;
  workspaceSnapshot: WorkspaceSnapshot;
  request: UnifiedVideoGenerateRequest;
}): Promise<UnifiedVideoGenerationSuccess> {
  const request = validateUnifiedVideoRequest(params.request);
  const modelDefinition = getVideoModelDefinition(request.modelId);
  const modelSettings = params.workspaceSnapshot.videoWorkspace.models[request.modelId];
  assertConfiguredModel(modelSettings, request.modelId);

  const adapter = PROVIDER_ADAPTERS[modelDefinition.provider];
  const result = await adapter.submit({
    modelId: request.modelId,
    modelDefinition,
    modelSettings,
    request,
  });

  try {
    const videoUrl = await persistGeneratedVideoToStorage(
      params.supabase,
      params.userId,
      result.remoteVideoUrl,
      randomUUID(),
    );
    return {
      providerTaskId: result.providerTaskId,
      videoUrl,
    };
  } catch (error) {
    throw new VideoGenerationError(
      "storage_persist_failed",
      error instanceof Error ? error.message : "视频云存储失败",
    );
  }
}
