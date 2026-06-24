import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistGeneratedVideoToStorage } from "@/lib/db/persist-generated-video";
import type { WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import {
  getVideoCapabilities,
  getVideoParameterCapabilities,
  getVideoModelDefinition,
  isVideoDurationSupported,
  type UnifiedVideoGenerateRequest,
  type UnifiedVideoReference,
  type VideoGenerationModeId,
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

function configuredApiModelName(model: VideoModelSettings, modeId: VideoGenerationModeId): string {
  const value = String(model.apiModelNameByMode?.[modeId] ?? "").trim();
  if (!value) {
    throw new VideoGenerationError("model_not_configured", `模型「${model.label || model.id}」的「${modeId}」模式缺少 API 模型 ID，请先到设置页填写。`);
  }
  return value;
}

function assertConfiguredModel(model: VideoModelSettings, modelId: VideoModelId, modeId: VideoGenerationModeId) {
  if (!model.enabled) {
    throw new VideoGenerationError("model_not_configured", `模型「${model.label || modelId}」当前未启用。`);
  }
  if (!model.baseUrl.trim() || !model.apiKey.trim()) {
    throw new VideoGenerationError(
      "model_not_configured",
      `模型「${model.label || modelId}」未配置完整，请先填写 Base URL / API Key。`,
    );
  }
  configuredApiModelName(model, modeId);
}

function resolveAutoDispatchedVideoModelSettings(
  models: WorkspaceSnapshot["videoWorkspace"]["models"],
  modelId: VideoModelId,
): VideoModelSettings {
  const model = models[modelId];
  if (!isAutoDispatchedVideoModel(modelId) || (model.baseUrl.trim() && model.apiKey.trim())) return model;

  const source = Object.values(models).find((candidate) =>
    isAutoDispatchedVideoModel(candidate.id) &&
    candidate.baseUrl.trim() &&
    candidate.apiKey.trim() &&
    /evolink\.ai/i.test(candidate.baseUrl),
  ) ?? Object.values(models).find((candidate) =>
    isAutoDispatchedVideoModel(candidate.id) &&
    candidate.baseUrl.trim() &&
    candidate.apiKey.trim(),
  );

  if (!source) return model;

  return {
    ...model,
    baseUrl: model.baseUrl.trim() || source.baseUrl,
    apiKey: model.apiKey.trim() || source.apiKey,
    providerOptions: {
      ...source.providerOptions,
      ...model.providerOptions,
      submitPath: typeof model.providerOptions.submitPath === "string" && model.providerOptions.submitPath.trim()
        ? model.providerOptions.submitPath
        : typeof source.providerOptions.submitPath === "string" && source.providerOptions.submitPath.trim()
          ? source.providerOptions.submitPath
          : "/v1/videos/generations",
      statusPath: typeof model.providerOptions.statusPath === "string" && model.providerOptions.statusPath.trim()
        ? model.providerOptions.statusPath
        : typeof source.providerOptions.statusPath === "string" && source.providerOptions.statusPath.trim()
          ? source.providerOptions.statusPath
          : "/v1/tasks/{taskId}",
    },
  };
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
  if (request.grokImagineMode && request.grokImagineMode !== "normal" && request.grokImagineMode !== "fun" && request.grokImagineMode !== "spicy") {
    throw new VideoGenerationError("invalid_mode", "Grok Imagine 风格只支持 normal / fun / spicy。");
  }
  const parameterCapabilities = getVideoParameterCapabilities(request.modelId, request.modeId, request.references);
  if (parameterCapabilities.supportsDuration && parameterCapabilities.durationCapability && !isVideoDurationSupported(request.durationSeconds, parameterCapabilities.durationCapability)) {
    throw new VideoGenerationError("invalid_mode", `当前模型不支持 ${request.durationSeconds}s 时长。`);
  }
  if (!parameterCapabilities.supportsDuration && Number.isFinite(request.durationSeconds) && request.durationSeconds > 0 && request.modeId !== "video_edit" && request.modeId !== "motion_control") {
    throw new VideoGenerationError("invalid_mode", "当前模式不支持设置时长。");
  }
  if (parameterCapabilities.supportsAspectRatio && request.aspectRatio && !parameterCapabilities.aspectRatios.includes(request.aspectRatio)) {
    throw new VideoGenerationError("invalid_mode", `当前模型不支持 ${request.aspectRatio} 比例。`);
  }
  if (!parameterCapabilities.supportsAspectRatio && request.aspectRatio) {
    throw new VideoGenerationError("invalid_mode", "当前模式不支持设置比例。");
  }
  if (request.resolution && !parameterCapabilities.resolutions.includes(request.resolution)) {
    throw new VideoGenerationError("invalid_mode", `当前模型不支持 ${request.resolution} 分辨率。`);
  }

  const references = dedupeReferences(request.references);
  const startFrameCount = countRole(references, "start_frame");
  const endFrameCount = countRole(references, "end_frame");
  const imageRefCount = countRole(references, "image_reference");
  const videoRefCount = countRole(references, "video_reference");
  const audioRefCount = countRole(references, "audio_reference");
  const motionSourceCount = countRole(references, "motion_source_video");

  if (startFrameCount > 1 || endFrameCount > 1 || motionSourceCount > 1) {
    throw new VideoGenerationError("invalid_mode", "首帧、尾帧或动作参考视频只能各提供一个。");
  }

  if (request.modeId === "multi_image_reference" && isHappyHorseFamily(request.modelId) && (imageRefCount < 1 || videoRefCount > 0 || audioRefCount > 0)) {
    throw new VideoGenerationError("invalid_mode", "HappyHorse 全能参考模式只支持 1~9 张图片参考，不支持视频或音频参考。");
  }
  if (request.modeId === "multi_image_reference" && isVeo31Family(request.modelId) && (imageRefCount < 1 || videoRefCount > 0 || audioRefCount > 0)) {
    throw new VideoGenerationError("invalid_mode", "Veo 3.1 全能参考只支持 1~3 张图片参考，不支持视频或音频参考。");
  }

  if (imageRefCount > capabilities.maxImageReferences) {
    throw new VideoGenerationError(
      "unsupported_capability",
      `当前模型最多只支持 ${capabilities.maxImageReferences} 张参考图。`,
    );
  }
  if (videoRefCount > capabilities.maxVideoReferences) {
    throw new VideoGenerationError(
      "unsupported_capability",
      `当前模型最多只支持 ${capabilities.maxVideoReferences} 个参考视频。`,
    );
  }
  if (audioRefCount > capabilities.maxAudioReferences) {
    throw new VideoGenerationError(
      "unsupported_capability",
      `当前模型最多只支持 ${capabilities.maxAudioReferences} 个参考音频。`,
    );
  }

  switch (request.modeId) {
    case "text_to_video":
      if (references.length > 0) {
        throw new VideoGenerationError("invalid_mode", "文生视频模式不接收参考素材。");
      }
      break;
    case "start_frame":
      if (startFrameCount !== 1 || endFrameCount !== 0 || imageRefCount !== 0 || videoRefCount !== 0 || audioRefCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "首帧模式需要且只需要 1 张首帧图。");
      }
      break;
    case "start_end_frame":
      if (!capabilities.supportsFirstLastFrames) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持首尾帧模式。");
      }
      if (startFrameCount !== 1 || endFrameCount !== 1 || imageRefCount !== 0 || videoRefCount !== 0 || audioRefCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "首尾帧模式需要 1 张首帧图和 1 张尾帧图。");
      }
      break;
    case "multi_image_reference":
      if (!capabilities.supportsMultipleImageReferences) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持全能参考模式。");
      }
      if (imageRefCount + videoRefCount + audioRefCount < 1 || startFrameCount !== 0 || endFrameCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "全能参考模式需要至少 1 个图片、视频或音频参考素材，且不接收动作控制视频。");
      }
      break;
    case "video_edit":
      if (!capabilities.supportedModes.includes("video_edit")) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持视频编辑模式。");
      }
      if (videoRefCount !== 1 || startFrameCount !== 0 || endFrameCount !== 0 || audioRefCount !== 0 || motionSourceCount !== 0) {
        throw new VideoGenerationError("invalid_mode", "视频编辑模式需要且只需要 1 个原视频素材，可附加参考图。");
      }
      if (request.modelId === "happyhorse-1.0" && imageRefCount > 5) {
        throw new VideoGenerationError("unsupported_capability", "HappyHorse 1.0 视频编辑最多支持 5 张参考图。");
      }
      break;
    case "motion_control":
      if (!capabilities.supportsMotionControl) {
        throw new VideoGenerationError("unsupported_capability", "当前模型不支持动作迁移模式。");
      }
      if (motionSourceCount !== 1 || startFrameCount !== 1 || endFrameCount !== 0 || imageRefCount > 0 || videoRefCount > 0 || audioRefCount > 0) {
        throw new VideoGenerationError("invalid_mode", "动作迁移模式需要且只需要 1 张主体参考图和 1 个动作参考视频。");
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

function isAutoDispatchedVideoModel(modelId: VideoModelId): boolean {
  return modelId === "seedance-2.0" ||
    modelId === "seedance-2.0-fast" ||
    modelId === "seedance-1.5-pro" ||
    modelId === "doubao-seedance-1.0-pro-fast" ||
    modelId === "kling-3.0" ||
    modelId === "kling-2.6-motion" ||
    modelId === "happyhorse-1.1" ||
    modelId === "happyhorse-1.0" ||
    modelId === "grok-imagine" ||
    modelId === "veo-3.1" ||
    modelId === "veo-3.1-fast";
}

function isSeedance20Family(modelId: VideoModelId): boolean {
  return modelId === "seedance-2.0" || modelId === "seedance-2.0-fast";
}

function isHappyHorseFamily(modelId: VideoModelId): boolean {
  return modelId === "happyhorse-1.1" || modelId === "happyhorse-1.0";
}

function isVeo31Family(modelId: VideoModelId): boolean {
  return modelId === "veo-3.1" || modelId === "veo-3.1-fast";
}

function resolveSeedanceGenerationMode(modeId: UnifiedVideoGenerateRequest["modeId"]): "text_to_video" | "image_to_video" | "reference_to_video" {
  switch (modeId) {
    case "text_to_video":
      return "text_to_video";
    case "start_frame":
    case "start_end_frame":
      return "image_to_video";
    default:
      return "reference_to_video";
  }
}

function resolveTaskStatusUrl(baseUrl: string, modelSettings: VideoModelSettings, providerTaskId: string): string {
  const rawStatusPath =
    typeof modelSettings.providerOptions.statusPath === "string" && modelSettings.providerOptions.statusPath.trim()
      ? modelSettings.providerOptions.statusPath.trim()
      : "/v1/tasks/{taskId}";
  const taskIdToken = encodeURIComponent(providerTaskId);
  if (rawStatusPath.includes("{taskId}") || rawStatusPath.includes("{task_id}") || rawStatusPath.includes("{id}")) {
    return buildUrl(
      baseUrl,
      rawStatusPath
        .replace("{taskId}", taskIdToken)
        .replace("{task_id}", taskIdToken)
        .replace("{id}", taskIdToken),
    );
  }
  if (rawStatusPath.includes("?") && !rawStatusPath.includes("task_id=") && !rawStatusPath.includes("taskId=")) {
    return `${buildUrl(baseUrl, rawStatusPath)}&task_id=${taskIdToken}`;
  }
  if (rawStatusPath.includes("?")) {
    return buildUrl(baseUrl, rawStatusPath);
  }
  return `${buildUrl(baseUrl, rawStatusPath)}/${taskIdToken}`;
}

function readBooleanOption(options: VideoProviderOptions, key: string): boolean | undefined {
  const value = options[key];
  return typeof value === "boolean" ? value : undefined;
}

function soundEnabledWithDefault(request: UnifiedVideoGenerateRequest, defaultEnabled: boolean): boolean {
  return typeof request.soundEnabled === "boolean" ? request.soundEnabled : defaultEnabled;
}

function extractCompletedTaskVideoUrl(data: Record<string, unknown>): string {
  if (typeof data.results === "string") return String(data.results).trim();
  if (Array.isArray(data.results) && data.results.length > 0) {
    const head = data.results[0];
    if (typeof head === "string") return head.trim();
    if (head && typeof head === "object" && "url" in head && typeof head.url === "string") return head.url.trim();
  }
  if (typeof data.video_url === "string") return data.video_url.trim();
  if (typeof data.url === "string") return data.url.trim();
  if (typeof data.result_url === "string") return data.result_url.trim();
  if (Array.isArray(data.response) && typeof data.response[0] === "string") return String(data.response[0]).trim();
  return "";
}

async function submitSeedance(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  const { modelId, modelSettings, request } = ctx;
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferences = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url);
  const videoReferences = request.references
    .filter((item) => item.role === "video_reference")
    .map((item) => item.url);
  const audioReferences = request.references
    .filter((item) => item.role === "audio_reference")
    .map((item) => item.url);
  const images = startFrame ? [startFrame.url, ...(endFrame ? [endFrame.url] : [])] : imageReferences;
  const generationMode = resolveSeedanceGenerationMode(request.modeId);
  const seedanceModel = configuredApiModelName(modelSettings, request.modeId);
  const legacyGenerateAudio = readBooleanOption(modelSettings.providerOptions, "generateAudio");
  const generateAudio = modelId === "doubao-seedance-1.0-pro-fast"
    ? undefined
    : typeof request.soundEnabled === "boolean"
      ? request.soundEnabled
      : typeof legacyGenerateAudio === "boolean"
        ? legacyGenerateAudio
        : true;
  const contentFilter =
    readBooleanOption(modelSettings.providerOptions, "contentFilter") ??
    readBooleanOption(modelSettings.providerOptions, "content_filter");
  const webSearch = readBooleanOption(modelSettings.providerOptions, "webSearch") ?? readBooleanOption(modelSettings.providerOptions, "web_search");
  const createPayload = {
    model: seedanceModel,
    prompt: request.prompt,
    duration: request.durationSeconds,
    aspect_ratio: request.aspectRatio,
    ...(request.resolution ? { quality: request.resolution } : {}),
    ...(typeof generateAudio === "boolean" ? { generate_audio: generateAudio } : {}),
    ...(isSeedance20Family(modelId) && typeof contentFilter === "boolean" ? { content_filter: contentFilter } : {}),
    ...(isSeedance20Family(modelId) && generationMode === "text_to_video" && typeof webSearch === "boolean"
      ? { model_params: { web_search: webSearch } }
      : {}),
    ...(images.length > 0 ? { image_urls: images } : {}),
    ...(isSeedance20Family(modelId) && videoReferences.length > 0 ? { video_urls: videoReferences } : {}),
    ...(isSeedance20Family(modelId) && audioReferences.length > 0 ? { audio_urls: audioReferences } : {}),
  };
  const submitPath = typeof modelSettings.providerOptions.submitPath === "string" && modelSettings.providerOptions.submitPath.trim()
    ? modelSettings.providerOptions.submitPath.trim()
    : "/v1/videos/generations";
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
    data?: { task_id?: string; id?: string };
    id?: string;
  };
  if (!submitRes.ok) {
    throw new VideoGenerationError(
      "provider_submit_failed",
      String(submitData.error || submitData.message || "提交任务失败"),
    );
  }
  const providerTaskId = String(
    submitData.id ??
      submitData.data?.id ??
      submitData.data?.task_id ??
      "",
  ).trim();
  if (!providerTaskId) {
    throw new VideoGenerationError("provider_submit_failed", "上游未返回任务 ID。");
  }

  const statusUrl = resolveTaskStatusUrl(modelSettings.baseUrl, modelSettings, providerTaskId);
  const timeoutMs = Number(modelSettings.providerOptions.timeoutMs) || 6 * 60_000;
  const intervalMs = Number(modelSettings.providerOptions.intervalMs) || 1800;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new VideoGenerationError("provider_timeout", "任务超时，请稍后重试。");
    }
    let statusRes: Response;
    try {
      statusRes = await fetch(statusUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${modelSettings.apiKey}` },
        cache: "no-store",
      });
    } catch (error) {
      throw new VideoGenerationError("provider_poll_failed", error instanceof Error ? error.message : "查询任务失败");
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      data?: { status?: string; state?: string; response?: string[]; results?: unknown; error_message?: string | null };
    };
    if (!statusRes.ok) {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(statusData.error || statusData.message || "查询任务失败"),
      );
    }
    const statusContainer = statusData.data && typeof statusData.data === "object" ? statusData.data : statusData;
    const status = String(
      (statusContainer as { status?: string; state?: string }).status ??
        (statusContainer as { status?: string; state?: string }).state ??
        "",
    ).trim().toUpperCase();
    if (status === "SUCCESS") {
      const remoteVideoUrl = extractCompletedTaskVideoUrl(statusContainer);
      if (!remoteVideoUrl) {
        throw new VideoGenerationError("result_missing", "任务完成但未返回视频地址。");
      }
      return { providerTaskId, remoteVideoUrl };
    }
    if (status === "COMPLETED" || status === "DONE" || status === "SUCCEEDED") {
      const remoteVideoUrl = extractCompletedTaskVideoUrl(statusContainer);
      if (!remoteVideoUrl) {
        throw new VideoGenerationError("result_missing", "任务完成但未返回视频地址。");
      }
      return { providerTaskId, remoteVideoUrl };
    }
    if (status === "FAILED" || status === "CANCELLED" || status === "CANCELED") {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(
          (statusContainer as { error_message?: string; error?: string }).error_message ||
            (statusContainer as { error_message?: string; error?: string }).error ||
            "任务失败",
        ),
      );
    }
    if (status === "ERROR") {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(
          (statusContainer as { error_message?: string; error?: string }).error_message ||
            (statusContainer as { error_message?: string; error?: string }).error ||
            "任务失败",
        ),
      );
    }
    await wait(intervalMs);
  }
}

function buildKlingCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const configuredModel = apiModelName.trim();
  if (request.modelId === "kling-2.6-motion" && request.modeId === "motion_control") {
    const startFrame = request.references.find((item) => item.role === "start_frame");
    const motionSource = request.references.find((item) => item.role === "motion_source_video");
    if (!startFrame?.url || !motionSource?.url) {
      throw new VideoGenerationError("invalid_mode", "动作迁移模式需要 1 张主体参考图和 1 个动作参考视频。");
    }
    return {
      model: configuredModel,
      ...(request.prompt.trim() ? { prompt: request.prompt } : {}),
      image_urls: [startFrame.url],
      video_urls: [motionSource.url],
      ...(request.resolution ? { quality: request.resolution } : {}),
      model_params: {
        character_orientation: "image",
        keep_sound: soundEnabledWithDefault(request, true),
      },
    };
  }

  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferences = request.references.filter((item) => item.role === "image_reference").map((item) => item.url);
  const videoReference = request.references.find((item) => item.role === "video_reference");
  const basePayload = {
    model: configuredModel,
    prompt: request.prompt,
    ...(request.resolution ? { quality: request.resolution } : {}),
  };

  if (request.modeId === "video_edit") {
    if (!videoReference?.url) throw new VideoGenerationError("invalid_mode", "视频编辑模式需要 1 个原视频素材。");
    return {
      ...basePayload,
      video_url: videoReference.url,
      keep_original_sound: soundEnabledWithDefault(request, true),
      ...(imageReferences.length > 0 ? { image_urls: imageReferences } : {}),
    };
  }

  if (request.modeId === "multi_image_reference" && videoReference?.url) {
    if (!videoReference?.url) throw new VideoGenerationError("invalid_mode", "全能参考视频参考需要 1 个参考视频素材。");
    return {
      ...basePayload,
      duration: request.durationSeconds,
      aspect_ratio: request.aspectRatio,
      video_url: videoReference.url,
      keep_original_sound: soundEnabledWithDefault(request, true),
      ...(imageReferences.length > 0 ? { image_urls: imageReferences } : {}),
    };
  }

  if (request.modeId === "start_frame" || request.modeId === "start_end_frame" || imageReferences.length > 0) {
    return {
      ...basePayload,
      duration: request.durationSeconds,
      aspect_ratio: request.aspectRatio,
      sound: soundEnabledWithDefault(request, false) ? "on" : "off",
      ...(startFrame?.url ? { image_start: startFrame.url } : {}),
      ...(endFrame?.url ? { image_end: endFrame.url } : {}),
      ...(!startFrame?.url && imageReferences.length > 0 ? { image_urls: imageReferences } : {}),
    };
  }

  return {
    ...basePayload,
    duration: request.durationSeconds,
    aspect_ratio: request.aspectRatio,
    sound: soundEnabledWithDefault(request, false) ? "on" : "off",
  };
}

function buildHappyHorseCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const imageReferences = request.references.filter((item) => item.role === "image_reference").map((item) => item.url);
  const videoReference = request.references.find((item) => item.role === "video_reference");
  const model = apiModelName.trim();
  if (request.modeId === "multi_image_reference") {
    return {
      model,
      prompt: request.prompt,
      image_urls: imageReferences.slice(0, 9),
      ...(request.resolution ? { quality: request.resolution } : {}),
      aspect_ratio: request.aspectRatio,
      duration: request.durationSeconds,
    };
  }
  if (request.modeId === "video_edit") {
    return {
      model,
      prompt: request.prompt,
      video_urls: videoReference ? [videoReference.url] : [],
      ...(imageReferences.length > 0 ? { image_urls: imageReferences.slice(0, 5) } : {}),
      ...(request.resolution ? { quality: request.resolution } : {}),
      keep_original_sound: soundEnabledWithDefault(request, false),
    };
  }
  return {
    model,
    prompt: request.prompt,
    ...(request.resolution ? { quality: request.resolution } : {}),
    duration: request.durationSeconds,
    ...(model.endsWith("-image-to-video")
      ? startFrame?.url ? { image_urls: [startFrame.url] } : {}
      : { aspect_ratio: request.aspectRatio }),
  };
}

async function submitHappyHorse(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitEvoLinkVideoTask(ctx, buildHappyHorseCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

async function submitEvoLinkVideoTask(ctx: ProviderSubmitContext, payload: Record<string, unknown>): Promise<ProviderTaskResult> {
  const { modelSettings } = ctx;
  const submitPath = typeof modelSettings.providerOptions.submitPath === "string" && modelSettings.providerOptions.submitPath.trim()
    ? modelSettings.providerOptions.submitPath.trim()
    : "/v1/videos/generations";
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

  const submitData = (await submitRes.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    data?: { task_id?: string; id?: string };
    id?: string;
    task_id?: string;
  };
  if (!submitRes.ok) {
    throw new VideoGenerationError(
      "provider_submit_failed",
      String(submitData.error || submitData.message || "提交任务失败"),
    );
  }
  const providerTaskId = String(
    submitData.id ??
      submitData.task_id ??
      submitData.data?.id ??
      submitData.data?.task_id ??
      "",
  ).trim();
  if (!providerTaskId) {
    throw new VideoGenerationError("provider_submit_failed", "上游未返回任务 ID。");
  }

  const statusUrl = resolveTaskStatusUrl(modelSettings.baseUrl, modelSettings, providerTaskId);
  const timeoutMs = Number(modelSettings.providerOptions.timeoutMs) || 6 * 60_000;
  const intervalMs = Number(modelSettings.providerOptions.intervalMs) || 1800;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new VideoGenerationError("provider_timeout", "任务超时，请稍后重试。");
    }
    let statusRes: Response;
    try {
      statusRes = await fetch(statusUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${modelSettings.apiKey}` },
        cache: "no-store",
      });
    } catch (error) {
      throw new VideoGenerationError("provider_poll_failed", error instanceof Error ? error.message : "查询任务失败");
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!statusRes.ok) {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(statusData.error || statusData.message || "查询任务失败"),
      );
    }
    const statusContainer = statusData.data && typeof statusData.data === "object" ? statusData.data as Record<string, unknown> : statusData;
    const status = String(statusContainer.status ?? statusContainer.state ?? "").trim().toUpperCase();
    if (status === "SUCCESS" || status === "COMPLETED" || status === "DONE" || status === "SUCCEEDED") {
      const remoteVideoUrl = extractCompletedTaskVideoUrl(statusContainer);
      if (!remoteVideoUrl) {
        throw new VideoGenerationError("result_missing", "任务完成但未返回视频地址。");
      }
      return { providerTaskId, remoteVideoUrl };
    }
    if (status === "FAILED" || status === "CANCELLED" || status === "CANCELED" || status === "ERROR") {
      throw new VideoGenerationError(
        "provider_poll_failed",
        String(statusContainer.error_message || statusContainer.error || statusContainer.message || "任务失败"),
      );
    }
    await wait(intervalMs);
  }
}

async function submitKling(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  const payload = buildKlingCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId));
  return submitEvoLinkVideoTask(ctx, payload);
}

function normalizeGrokImagineMode(value: unknown): "normal" | "fun" | "spicy" {
  return value === "fun" || value === "spicy" || value === "normal" ? value : "normal";
}

function buildGrokImagineCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const imageUrls = startFrame ? [startFrame.url] : [];
  const isImageToVideo = request.modeId === "start_frame";
  return {
    model: apiModelName.trim(),
    prompt: request.prompt,
    duration: request.durationSeconds,
    mode: normalizeGrokImagineMode(request.grokImagineMode),
    ...(request.resolution ? { quality: request.resolution } : {}),
    ...(!isImageToVideo ? { aspect_ratio: request.aspectRatio } : {}),
    ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
  };
}

async function submitGrokImagine(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitEvoLinkVideoTask(ctx, buildGrokImagineCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

function buildVeoCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferenceUrls = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url);
  const imageUrls = request.modeId === "multi_image_reference"
    ? imageReferenceUrls
    : startFrame
      ? [startFrame.url, ...(endFrame ? [endFrame.url] : [])]
      : [];
  const generationType = request.modeId === "multi_image_reference"
    ? "REFERENCE"
    : request.modeId === "text_to_video"
      ? "TEXT"
      : "FIRST&LAST";
  const model = apiModelName.trim();
  return {
    model,
    prompt: request.prompt,
    generation_type: generationType,
    duration: generationType === "REFERENCE" ? 8 : request.durationSeconds,
    aspect_ratio: generationType === "REFERENCE" ? "16:9" : request.aspectRatio,
    ...(request.resolution ? { quality: request.resolution } : {}),
    generate_audio: soundEnabledWithDefault(request, true),
    ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
  };
}

async function submitVeo(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitEvoLinkVideoTask(ctx, buildVeoCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

async function submitGeminiOmni(): Promise<ProviderTaskResult> {
  throw new VideoGenerationError("contract_pending", "Gemini Omni 当前仅做独立占位，待可信 API 契约确认后再开放提交。");
}

export function buildVideoCreatePayloadForTest(ctx: ProviderSubmitContext): Record<string, unknown> {
  switch (ctx.modelDefinition.provider) {
    case "seedance":
      const seedanceStartFrame = ctx.request.references.find((item) => item.role === "start_frame");
      const seedanceEndFrame = ctx.request.references.find((item) => item.role === "end_frame");
      const seedanceImages = seedanceStartFrame
        ? [seedanceStartFrame.url, ...(seedanceEndFrame ? [seedanceEndFrame.url] : [])]
        : ctx.request.references.filter((item) => item.role === "image_reference").map((item) => item.url);
      const seedanceVideos = ctx.request.references.filter((item) => item.role === "video_reference").map((item) => item.url);
      const seedanceAudios = ctx.request.references.filter((item) => item.role === "audio_reference").map((item) => item.url);
      const generationMode = resolveSeedanceGenerationMode(ctx.request.modeId);
      const legacyGenerateAudio = readBooleanOption(ctx.modelSettings.providerOptions, "generateAudio");
      const generateAudio = ctx.modelId === "doubao-seedance-1.0-pro-fast"
        ? undefined
        : typeof ctx.request.soundEnabled === "boolean"
          ? ctx.request.soundEnabled
          : typeof legacyGenerateAudio === "boolean"
            ? legacyGenerateAudio
            : true;
      return {
        prompt: ctx.request.prompt,
        aspect_ratio: ctx.request.aspectRatio,
        duration: ctx.request.durationSeconds,
        ...(ctx.request.resolution ? { quality: ctx.request.resolution } : {}),
        model: configuredApiModelName(ctx.modelSettings, ctx.request.modeId),
        ...(seedanceImages.length > 0 ? { image_urls: seedanceImages } : {}),
        ...(isSeedance20Family(ctx.modelId) && seedanceVideos.length > 0 ? { video_urls: seedanceVideos } : {}),
        ...(isSeedance20Family(ctx.modelId) && seedanceAudios.length > 0 ? { audio_urls: seedanceAudios } : {}),
        ...(typeof generateAudio === "boolean" ? { generate_audio: generateAudio } : {}),
        ...(isSeedance20Family(ctx.modelId) && (
          readBooleanOption(ctx.modelSettings.providerOptions, "contentFilter") ??
          readBooleanOption(ctx.modelSettings.providerOptions, "content_filter")
        ) === true
          ? { content_filter: true }
          : isSeedance20Family(ctx.modelId) && (
              readBooleanOption(ctx.modelSettings.providerOptions, "contentFilter") ??
              readBooleanOption(ctx.modelSettings.providerOptions, "content_filter")
            ) === false
            ? { content_filter: false }
            : {}),
        ...(isSeedance20Family(ctx.modelId) && generationMode === "text_to_video"
          ? (
              readBooleanOption(ctx.modelSettings.providerOptions, "webSearch") ??
              readBooleanOption(ctx.modelSettings.providerOptions, "web_search")
            ) === true
            ? { model_params: { web_search: true } }
            : (
                readBooleanOption(ctx.modelSettings.providerOptions, "webSearch") ??
                readBooleanOption(ctx.modelSettings.providerOptions, "web_search")
              ) === false
              ? { model_params: { web_search: false } }
              : {}
          : {}),
      };
    case "kling":
      return buildKlingCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId));
    case "happyhorse":
      return buildHappyHorseCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId));
    case "grok":
      return buildGrokImagineCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId));
    case "veo":
      return buildVeoCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId));
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
  happyhorse: { submit: submitHappyHorse },
  grok: { submit: submitGrokImagine },
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
  const modelSettings = resolveAutoDispatchedVideoModelSettings(
    params.workspaceSnapshot.videoWorkspace.models,
    request.modelId,
  );
  assertConfiguredModel(modelSettings, request.modelId, request.modeId);

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
