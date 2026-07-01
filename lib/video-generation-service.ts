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

  upstreamStatus?: number;
  upstreamBody?: unknown;

  constructor(
    code: VideoGenerationError["code"],
    message: string,
    options?: { upstreamStatus?: number; upstreamBody?: unknown },
  ) {
    super(message);
    this.code = code;
    this.upstreamStatus = options?.upstreamStatus;
    this.upstreamBody = options?.upstreamBody;
  }
}

function configuredApiModelName(model: VideoModelSettings, modeId: VideoGenerationModeId): string {
  const value = String(model.apiModelNameByMode?.[modeId] ?? "").trim();
  if (!value) {
    throw new VideoGenerationError("model_not_configured", `网站内部视频 API 暂未配置完整（${model.label || model.id} / ${modeId}），请联系管理员。`);
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
      `网站内部视频 API 暂未配置完整（${model.label || modelId}），请联系管理员。`,
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
  if (request.modeId === "multi_image_reference" && request.modelId === "kling-3.0" && (imageRefCount < 1 || videoRefCount > 0 || audioRefCount > 0)) {
    throw new VideoGenerationError("invalid_mode", "Kling 3.0 全能参考只支持 1~3 张图片参考，不支持视频或音频参考。");
  }
  if (request.modeId === "multi_image_reference" && isVeo31Family(request.modelId) && (imageRefCount < 1 || videoRefCount > 0 || audioRefCount > 0)) {
    throw new VideoGenerationError("invalid_mode", "Veo 3.1 全能参考只支持 1~3 张图片参考，不支持视频或音频参考。");
  }
  if (request.modelId === "gemini-omni") {
    if (request.prompt.length > 20_000) {
      throw new VideoGenerationError("invalid_mode", "Gemini Omni 提示词最多 20000 个字符。");
    }
    if (videoRefCount > 0 && imageRefCount > 5) {
      throw new VideoGenerationError("unsupported_capability", "Gemini Omni 带视频参考时最多支持 5 张参考图。");
    }
  }
  if (request.modeId === "multi_image_reference" && isSeedance20Family(request.modelId) && imageRefCount + videoRefCount < 1) {
    throw new VideoGenerationError("invalid_mode", "Seedance 全能参考模式需要至少 1 个图片或视频参考素材。");
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

function isCrunBaseUrl(baseUrl: string): boolean {
  return /crun\.ai/i.test(baseUrl) || /\/api\/v1\/client\/job\/CreateTask(?:[?#]|$)/i.test(baseUrl);
}

function crunCreateTaskUrl(baseUrl: string): string {
  const raw = baseUrl.trim();
  if (/\/api\/v1\/client\/job\/CreateTask(?:[?#]|$)/i.test(raw)) return raw;
  return buildUrl(raw, "/api/v1/client/job/CreateTask");
}

function crunTaskInfoUrl(baseUrl: string): string {
  const raw = baseUrl.trim();
  try {
    const parsed = new URL(raw);
    parsed.pathname = "/api/v1/client/job/TaskInfo";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return raw.replace(/\/api\/v1\/client\/job\/CreateTask(?:[?#].*)?$/i, "/api/v1/client/job/TaskInfo");
  }
}

function isAutoDispatchedVideoModel(modelId: VideoModelId): boolean {
  return modelId === "seedance-2.0" ||
    modelId === "seedance-2.0-fast" ||
    modelId === "seedance-2.0-mini" ||
    modelId === "seedance-1.5-pro" ||
    modelId === "doubao-seedance-1.0-pro-fast" ||
    modelId === "seedance-1.0-pro" ||
    modelId === "kling-3.0" ||
    modelId === "kling-3.0-motion" ||
    modelId === "kling-2.6-motion" ||
    modelId === "happyhorse-1.1" ||
    modelId === "happyhorse-1.0" ||
    modelId === "grok-imagine" ||
    modelId === "veo-3.1" ||
    modelId === "veo-3.1-fast" ||
    modelId === "veo-3.1-lite" ||
    modelId === "gemini-omni";
}

function isSeedance20Family(modelId: VideoModelId): boolean {
  return modelId === "seedance-2.0" || modelId === "seedance-2.0-fast" || modelId === "seedance-2.0-mini";
}

function isHappyHorseFamily(modelId: VideoModelId): boolean {
  return modelId === "happyhorse-1.1" || modelId === "happyhorse-1.0";
}

function isVeo31Family(modelId: VideoModelId): boolean {
  return modelId === "veo-3.1" || modelId === "veo-3.1-fast" || modelId === "veo-3.1-lite";
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

function assertCrunSeedanceReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    throw new VideoGenerationError("invalid_mode", "CRUN Seedance 参考素材必须是公网 http(s) URL 或已上传的 AssetId。");
  }
}

function assertCrunVideoReference(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    throw new VideoGenerationError("invalid_mode", `${label} 参考素材必须是公网 http(s) URL 或已上传的 AssetId。`);
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
  if (Array.isArray(data.media_urls) && typeof data.media_urls[0] === "string") return String(data.media_urls[0]).trim();
  if (Array.isArray(data.mediaUrls) && typeof data.mediaUrls[0] === "string") return String(data.mediaUrls[0]).trim();
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
  if (data.result && typeof data.result === "object") return extractCompletedTaskVideoUrl(data.result as Record<string, unknown>);
  if (data.data && typeof data.data === "object") return extractCompletedTaskVideoUrl(data.data as Record<string, unknown>);
  return "";
}

async function submitSeedance(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  const { modelId, modelSettings, request } = ctx;
  if (isCrunBaseUrl(modelSettings.baseUrl)) {
    return submitCrunVideoTask(
      ctx,
      buildCrunSeedanceCreatePayload(request, modelId, configuredApiModelName(modelSettings, request.modeId), modelSettings.providerOptions),
    );
  }
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

function buildCrunSeedanceCreatePayload(
  request: UnifiedVideoGenerateRequest,
  modelId: VideoModelId,
  apiModelName: string,
  providerOptions: VideoProviderOptions,
) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferences = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url.trim());
  const videoReferences = request.references
    .filter((item) => item.role === "video_reference")
    .map((item) => item.url.trim());
  const audioReferences = request.references
    .filter((item) => item.role === "audio_reference")
    .map((item) => item.url.trim());
  const imgUrls = startFrame ? [startFrame.url.trim(), ...(endFrame ? [endFrame.url.trim()] : [])] : [];
  for (const ref of [...imgUrls, ...imageReferences, ...videoReferences, ...audioReferences]) {
    assertCrunSeedanceReference(ref);
  }
  const legacyGenerateAudio = readBooleanOption(providerOptions, "generateAudio");
  const audio = modelId === "doubao-seedance-1.0-pro-fast"
    ? undefined
    : typeof request.soundEnabled === "boolean"
      ? request.soundEnabled
      : typeof legacyGenerateAudio === "boolean"
        ? legacyGenerateAudio
        : undefined;
  const input: Record<string, unknown> = {
    prompt: request.prompt,
    ...(request.resolution ? { resolution: request.resolution } : {}),
    ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
    ...(Number.isFinite(request.durationSeconds) && request.durationSeconds > 0 ? { duration: request.durationSeconds } : {}),
    ...(typeof audio === "boolean" ? { audio } : {}),
  };

  if (request.modeId === "start_frame" || request.modeId === "start_end_frame") {
    input.img_urls = imgUrls;
  } else if (request.modeId === "multi_image_reference") {
    if (imageReferences.length > 0) input.reference_images = imageReferences;
    if (videoReferences.length > 0) input.reference_videos = videoReferences;
    if (audioReferences.length > 0) input.reference_audios = audioReferences;
  }

  return {
    model: apiModelName.trim(),
    ...input,
  };
}

function klingGenerationModeFromResolution(resolution: UnifiedVideoGenerateRequest["resolution"]): "std" | "pro" | "4K" {
  if (resolution === "4k") return "4K";
  if (resolution === "1080p") return "pro";
  return "std";
}

function klingMotionModeFromResolution(resolution: UnifiedVideoGenerateRequest["resolution"]): "std" | "pro" {
  return resolution === "1080p" ? "pro" : "std";
}

function buildKlingElementList(imageReferences: UnifiedVideoReference[]) {
  return imageReferences.map((item, index) => {
    const url = item.url.trim();
    assertCrunVideoReference(url, "CRUN Kling");
    return {
      name: `element_${index + 1}`,
      description: item.label?.trim() || `reference image ${index + 1}`,
      element_image_urls: [url],
    };
  });
}

function buildKlingCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const configuredModel = apiModelName.trim();
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");

  if ((request.modelId === "kling-3.0" || request.modelId === "kling-3.0-motion" || request.modelId === "kling-2.6-motion") && request.modeId === "motion_control") {
    const motionSource = request.references.find((item) => item.role === "motion_source_video");
    if (!startFrame?.url || !motionSource?.url) {
      throw new VideoGenerationError("invalid_mode", "动作迁移模式需要 1 张主体参考图和 1 个动作参考视频。");
    }
    const imageUrl = startFrame.url.trim();
    const videoUrl = motionSource.url.trim();
    assertCrunVideoReference(imageUrl, "CRUN Kling Motion");
    assertCrunVideoReference(videoUrl, "CRUN Kling Motion");
    return {
      model: configuredModel,
      img_urls: [imageUrl],
      video_urls: [videoUrl],
      character_orientation: "image",
      ...(request.prompt.trim() ? { prompt: request.prompt } : {}),
      mode: klingMotionModeFromResolution(request.resolution),
      keep_original_sound: soundEnabledWithDefault(request, true),
    };
  }

  const imgUrls = startFrame ? [startFrame.url.trim(), ...(endFrame ? [endFrame.url.trim()] : [])] : [];
  const imageReferences = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => ({ ...item, url: item.url.trim() }));
  for (const ref of imgUrls) {
    assertCrunVideoReference(ref, "CRUN Kling");
  }
  const elementList = request.modeId === "multi_image_reference" ? buildKlingElementList(imageReferences.slice(0, 3)) : [];

  return {
    model: configuredModel,
    mode: klingGenerationModeFromResolution(request.resolution),
    multi_shots: false,
    prompt: request.prompt,
    duration: request.durationSeconds,
    ...(imgUrls.length > 0 ? { img_urls: imgUrls } : {}),
    ...(imgUrls.length === 0 && request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
    audio: soundEnabledWithDefault(request, false),
    ...(elementList.length > 0 ? { element_list: elementList } : {}),
  };
}

function buildHappyHorseCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const imageReferences = request.references.filter((item) => item.role === "image_reference").map((item) => item.url.trim());
  const videoReference = request.references.find((item) => item.role === "video_reference");
  const model = apiModelName.trim();
  const resolution = request.resolution === "1080p" ? "1080P" : "720P";
  const providerOptions = request.providerOptions ?? {};
  const region = providerOptions.region === "mainland" || providerOptions.region === "global" ? providerOptions.region : undefined;
  const inputCompliance = providerOptions.input_compliance === "enable" || providerOptions.input_compliance === "disable"
    ? providerOptions.input_compliance
    : undefined;
  const outputCompliance = providerOptions.output_compliance === "enable" || providerOptions.output_compliance === "disable"
    ? providerOptions.output_compliance
    : undefined;
  const common = {
    prompt: request.prompt,
    resolution,
    ...(region ? { region } : {}),
    ...(inputCompliance ? { input_compliance: inputCompliance } : {}),
    ...(outputCompliance ? { output_compliance: outputCompliance } : {}),
  };

  if (request.modeId === "multi_image_reference") {
    for (const ref of imageReferences) {
      assertCrunVideoReference(ref, "CRUN HappyHorse");
    }
    return {
      model,
      ...common,
      img_urls: imageReferences.slice(0, 9),
      duration: request.durationSeconds,
      ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
    };
  }
  if (request.modeId === "video_edit") {
    const videoUrl = videoReference?.url.trim();
    if (!videoUrl) {
      throw new VideoGenerationError("invalid_mode", "HappyHorse 视频编辑需要 1 个原视频素材。");
    }
    assertCrunVideoReference(videoUrl, "CRUN HappyHorse");
    for (const ref of imageReferences) {
      assertCrunVideoReference(ref, "CRUN HappyHorse");
    }
    return {
      model,
      ...common,
      video_url: videoUrl,
      ...(imageReferences.length > 0 ? { img_urls: imageReferences.slice(0, 5) } : {}),
      audio_setting: soundEnabledWithDefault(request, false) ? "origin" : "auto",
    };
  }
  const startFrameUrl = startFrame?.url.trim();
  if (request.modeId === "start_frame") {
    if (!startFrameUrl) {
      throw new VideoGenerationError("invalid_mode", "HappyHorse 首帧模式需要 1 张首帧图。");
    }
    assertCrunVideoReference(startFrameUrl, "CRUN HappyHorse");
  }
  return {
    model,
    ...common,
    duration: request.durationSeconds,
    ...(request.modeId === "start_frame"
      ? { img_urls: [startFrameUrl] }
      : request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
  };
}

async function submitHappyHorse(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitCrunVideoTask(ctx, buildHappyHorseCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

function crunTaskSucceeded(status: unknown): boolean {
  const value = String(status ?? "").trim().toUpperCase();
  return value === "SUCCESS" || value === "SUCCEEDED" || value === "COMPLETED" || value === "DONE" || value === "FINISHED";
}

function crunTaskFailed(status: unknown): boolean {
  return /^(FAILED|FAILURE|ERROR|CANCELLED|CANCELED)$/i.test(String(status ?? "").trim());
}

function parseCrunTaskId(data: Record<string, unknown>): string {
  const nested = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {};
  return String(
    data.id ??
      data.task_id ??
      data.taskId ??
      nested.id ??
      nested.task_id ??
      nested.taskId ??
      "",
  ).trim();
}

function parseProviderFailureMessage(data: Record<string, unknown>, fallback = "任务失败"): string {
  const nested = data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : {};
  for (const value of [
    data.errors,
    nested.errors,
    nested.error_message,
    nested.errorMessage,
    nested.error,
    nested.reason,
    nested.fail_reason,
    nested.failReason,
    nested.message,
    data.error_message,
    data.errorMessage,
    data.error,
    data.reason,
    data.fail_reason,
    data.failReason,
    data.message,
  ]) {
    if (typeof value === "string" && value.trim() && value.trim().toLowerCase() !== "success") return value.trim();
    if (Array.isArray(value) && value.length > 0) return value.map((item) => String(item)).join("；");
  }
  return fallback;
}

function crunBusinessCode(data: Record<string, unknown>): number | undefined {
  const raw = data.code;
  const code = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(code) ? code : undefined;
}

function assertCrunBusinessSuccess(
  data: Record<string, unknown>,
  stage: "provider_submit_failed" | "provider_poll_failed",
  httpStatus: number,
) {
  const code = crunBusinessCode(data);
  if (code === undefined || code === 200) return;
  throw new VideoGenerationError(
    stage,
    parseProviderFailureMessage(data),
    { upstreamStatus: code || httpStatus, upstreamBody: data },
  );
}

function buildCrunVideoInput(payload: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...payload };
  delete rest.model;
  return rest;
}

export function buildCrunVideoTaskPayloadForTest(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    model: String(payload.model ?? ""),
    input: buildCrunVideoInput(payload),
  };
}

async function submitCrunVideoTask(ctx: ProviderSubmitContext, payload: Record<string, unknown>): Promise<ProviderTaskResult> {
  const { modelSettings } = ctx;
  const submitUrl = crunCreateTaskUrl(modelSettings.baseUrl);
  let submitRes: Response;
  try {
    submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": modelSettings.apiKey,
      },
      body: JSON.stringify({
        ...buildCrunVideoTaskPayloadForTest({
          ...payload,
          model: String(payload.model ?? configuredApiModelName(modelSettings, ctx.request.modeId)),
        }),
      }),
    });
  } catch (error) {
    throw new VideoGenerationError("provider_submit_failed", error instanceof Error ? error.message : "提交任务失败");
  }

  const submitData = (await submitRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!submitRes.ok) {
    throw new VideoGenerationError(
      "provider_submit_failed",
      parseProviderFailureMessage(submitData),
      { upstreamStatus: submitRes.status, upstreamBody: submitData },
    );
  }
  assertCrunBusinessSuccess(submitData, "provider_submit_failed", submitRes.status);
  const providerTaskId = parseCrunTaskId(submitData);
  if (!providerTaskId) {
    throw new VideoGenerationError(
      "provider_submit_failed",
      parseProviderFailureMessage(submitData, "CRUN 已响应，但没有返回任务 ID。"),
      { upstreamStatus: submitRes.status, upstreamBody: submitData },
    );
  }

  const statusUrl = crunTaskInfoUrl(submitUrl);
  const timeoutMs = Number(modelSettings.providerOptions.timeoutMs) || 6 * 60_000;
  const intervalMs = Number(modelSettings.providerOptions.intervalMs) || 1800;
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new VideoGenerationError("provider_timeout", "任务超时，请稍后重试。");
    }
    let statusRes: Response;
    try {
      statusRes = await fetch(`${statusUrl}?task_id=${encodeURIComponent(providerTaskId)}`, {
        method: "GET",
        headers: { "X-API-KEY": modelSettings.apiKey },
        cache: "no-store",
      });
    } catch (error) {
      throw new VideoGenerationError("provider_poll_failed", error instanceof Error ? error.message : "查询任务失败");
    }
    const statusData = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!statusRes.ok) {
      throw new VideoGenerationError(
        "provider_poll_failed",
        parseProviderFailureMessage(statusData),
        { upstreamStatus: statusRes.status, upstreamBody: statusData },
      );
    }
    assertCrunBusinessSuccess(statusData, "provider_poll_failed", statusRes.status);
    const statusContainer = statusData.data && typeof statusData.data === "object" ? statusData.data as Record<string, unknown> : statusData;
    const status = statusContainer.status ?? statusContainer.state ?? statusData.status;
    const remoteVideoUrl = extractCompletedTaskVideoUrl(statusContainer) || extractCompletedTaskVideoUrl(statusData);
    if (remoteVideoUrl && (!status || crunTaskSucceeded(status))) {
      return { providerTaskId, remoteVideoUrl };
    }
    if (crunTaskFailed(status)) {
      throw new VideoGenerationError(
        "provider_poll_failed",
        parseProviderFailureMessage(statusData, "CRUN 任务失败，未返回具体原因。"),
        { upstreamStatus: 200, upstreamBody: statusData },
      );
    }
    await wait(intervalMs);
  }
}

// Legacy non-CRUN task adapter kept for historical provider configs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function submitEvoLinkVideoTask(ctx: ProviderSubmitContext, payload: Record<string, unknown>): Promise<ProviderTaskResult> {
  const { modelSettings } = ctx;
  if (isCrunBaseUrl(modelSettings.baseUrl)) {
    return submitCrunVideoTask(ctx, payload);
  }
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
  return submitCrunVideoTask(ctx, payload);
}

function normalizeGrokImagineMode(value: unknown): "normal" | "fun" | "spicy" {
  return value === "fun" || value === "spicy" || value === "normal" ? value : "normal";
}

function buildGrokImagineCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const imageUrls = startFrame ? [startFrame.url.trim()] : [];
  const isImageToVideo = request.modeId === "start_frame";
  for (const ref of imageUrls) {
    assertCrunVideoReference(ref, "CRUN Grok Imagine");
  }
  return {
    model: apiModelName.trim(),
    prompt: request.prompt,
    duration: request.durationSeconds,
    ...(request.resolution ? { resolution: request.resolution } : {}),
    ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
    ...(isImageToVideo ? { img_urls: imageUrls } : { mode: normalizeGrokImagineMode(request.grokImagineMode) }),
  };
}

async function submitGrokImagine(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitCrunVideoTask(ctx, buildGrokImagineCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

function buildVeoCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferenceUrls = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url.trim());
  const imageUrls = request.modeId === "multi_image_reference"
    ? imageReferenceUrls
    : startFrame
      ? [startFrame.url.trim(), ...(endFrame ? [endFrame.url.trim()] : [])]
      : [];
  for (const ref of imageUrls) {
    assertCrunVideoReference(ref, "CRUN Veo");
  }
  const model = apiModelName.trim();
  const aspectRatio = request.aspectRatio === "auto" || !request.aspectRatio ? "16:9" : request.aspectRatio;
  return {
    model,
    prompt: request.prompt,
    duration: request.modeId === "multi_image_reference" ? 8 : request.durationSeconds,
    aspect_ratio: request.modeId === "multi_image_reference" ? "16:9" : aspectRatio,
    ...(request.resolution ? { resolution: request.resolution } : {}),
    translate_prompt: true,
    ...(imageUrls.length > 0 ? { img_urls: imageUrls } : {}),
  };
}

async function submitVeo(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitCrunVideoTask(ctx, buildVeoCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

function buildGeminiOmniCreatePayload(request: UnifiedVideoGenerateRequest, apiModelName: string) {
  const startFrame = request.references.find((item) => item.role === "start_frame");
  const endFrame = request.references.find((item) => item.role === "end_frame");
  const imageReferenceUrls = request.references
    .filter((item) => item.role === "image_reference")
    .map((item) => item.url.trim());
  const videoReferences = request.references
    .filter((item) => item.role === "video_reference")
    .map((item) => item.url.trim());
  const imgUrls = request.modeId === "multi_image_reference"
    ? imageReferenceUrls
    : startFrame
      ? [startFrame.url.trim(), ...(endFrame ? [endFrame.url.trim()] : [])]
      : [];
  for (const ref of [...imgUrls, ...videoReferences]) {
    assertCrunVideoReference(ref, "CRUN Gemini Omni");
  }
  return {
    model: apiModelName.trim(),
    prompt: request.prompt,
    duration: request.durationSeconds,
    ...(request.aspectRatio ? { aspect_ratio: request.aspectRatio } : {}),
    ...(request.resolution ? { resolution: request.resolution } : {}),
    ...(imgUrls.length > 0 ? { img_urls: imgUrls } : {}),
    ...(videoReferences.length > 0
      ? { video_list: [{ url: videoReferences[0], start: 0, ends: request.durationSeconds }] }
      : {}),
  };
}

async function submitGeminiOmni(ctx: ProviderSubmitContext): Promise<ProviderTaskResult> {
  return submitCrunVideoTask(ctx, buildGeminiOmniCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)));
}

export function buildVideoCreatePayloadForTest(ctx: ProviderSubmitContext): Record<string, unknown> {
  switch (ctx.modelDefinition.provider) {
    case "seedance":
      return buildCrunVideoTaskPayloadForTest(
        buildCrunSeedanceCreatePayload(
          ctx.request,
          ctx.modelId,
          configuredApiModelName(ctx.modelSettings, ctx.request.modeId),
          ctx.modelSettings.providerOptions,
        ),
      );
    case "kling":
      return buildCrunVideoTaskPayloadForTest(
        buildKlingCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)),
      );
    case "happyhorse":
      return buildCrunVideoTaskPayloadForTest(
        buildHappyHorseCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)),
      );
    case "grok":
      return buildCrunVideoTaskPayloadForTest(
        buildGrokImagineCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)),
      );
    case "veo":
      return buildCrunVideoTaskPayloadForTest(
        buildVeoCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)),
      );
    case "gemini-omni":
      return buildCrunVideoTaskPayloadForTest(
        buildGeminiOmniCreatePayload(ctx.request, configuredApiModelName(ctx.modelSettings, ctx.request.modeId)),
      );
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
