import { pickNonEmptyTrimmed } from "@/lib/persisted-field";
import { BAKED_LLM_SETTINGS, BAKED_VIDEO_MODEL_DEFAULTS } from "@/lib/baked-api-defaults";
import { normalizePromptTags } from "@/lib/prompt-tags";
import {
  VIDEO_MODEL_ORDER,
  VIDEO_MODEL_REGISTRY,
  getVideoModelDefinition,
} from "@/lib/video-model-registry";
import type {
  UnifiedVideoReference,
  VideoAspectRatio,
  VideoCapabilitySet,
  VideoGenerationModeId,
  VideoModelDefinition,
  VideoModelId,
  VideoParameterCapabilities,
  VideoProviderOptions,
  VideoResolution,
  VideoSoundControl,
} from "@/lib/video-core";
import { VIDEO_GENERATION_MODES, VIDEO_MODE_LABELS, resolveVideoDurationCapability } from "@/lib/video-core";

export * from "@/lib/video-core";
export { VIDEO_MODEL_ORDER, VIDEO_GENERATION_MODES, VIDEO_MODE_LABELS, getVideoModelDefinition };

export type UiVideoModeId = "start_end_frame" | "multi_image_reference" | "video_edit" | "motion_control";

export const UI_VIDEO_MODES: ReadonlyArray<{ id: UiVideoModeId; label: string }> = [
  { id: "start_end_frame", label: "首尾帧" },
  { id: "multi_image_reference", label: "全能参考" },
  { id: "video_edit", label: "视频编辑" },
  { id: "motion_control", label: "动作迁移" },
];

export function inferEffectiveVideoMode(
  uiModeId: UiVideoModeId | string,
  hasStartFrame: boolean,
  hasEndFrame: boolean,
): { modeId: VideoGenerationModeId; error?: string } {
  if (uiModeId === "multi_image_reference") {
    return { modeId: "multi_image_reference" };
  }
  if (uiModeId === "video_edit") {
    return { modeId: "video_edit" };
  }
  if (uiModeId === "motion_control") {
    return { modeId: "motion_control" };
  }
  // Default to "start_end_frame" branch for anything else
  if (!hasStartFrame && !hasEndFrame) return { modeId: "text_to_video" };
  if (hasEndFrame && !hasStartFrame) return { modeId: "start_end_frame", error: "请先连接或上传首帧图，再连接或上传尾帧图。" };
  if (hasStartFrame && !hasEndFrame) return { modeId: "start_frame" };
  return { modeId: "start_end_frame" };
}

export const DISABLED_VIDEO_MODEL_IDS = new Set<VideoModelId>();

const HIDDEN_VIDEO_MODEL_IDS = DISABLED_VIDEO_MODEL_IDS;

export function isDisabledVideoModel(modelId: VideoModelId): boolean {
  return DISABLED_VIDEO_MODEL_IDS.has(modelId);
}

export function modelSupportsUiMode(modelId: VideoModelId, uiModeId: UiVideoModeId): boolean {
  if (HIDDEN_VIDEO_MODEL_IDS.has(modelId)) return false;
  const capabilities = getVideoCapabilities(modelId);
  if (uiModeId === "start_end_frame") {
    return capabilities.supportedModes.includes("text_to_video") || capabilities.supportedModes.includes("start_frame") || capabilities.supportedModes.includes("start_end_frame");
  }
  if (uiModeId === "multi_image_reference") {
    return capabilities.supportedModes.includes("multi_image_reference") && capabilities.supportsMultipleImageReferences;
  }
  if (uiModeId === "video_edit") {
    return capabilities.supportedModes.includes("video_edit");
  }
  if (uiModeId === "motion_control") {
    return capabilities.supportedModes.includes("motion_control") && capabilities.supportsMotionControl;
  }
  return false;
}

export function videoModelsForUiMode(uiModeId: UiVideoModeId): VideoModelId[] {
  return VIDEO_MODEL_ORDER.filter((modelId) => modelSupportsUiMode(modelId, uiModeId));
}

const STANDARD_RATIOS: VideoAspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const HAPPYHORSE_RATIOS: VideoAspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"];
const GROK_RATIOS: VideoAspectRatio[] = ["16:9", "9:16", "1:1", "3:2", "2:3"];
const VEO_RATIOS: VideoAspectRatio[] = ["auto", "16:9", "9:16"];
const SEEDANCE_IMAGE_RATIOS: VideoAspectRatio[] = [...STANDARD_RATIOS, "adaptive", "keep_ratio"];

function durationRange(min: number, max: number, defaultValue = 5, presets?: number[]) {
  return { type: "range" as const, min, max, step: 1, defaultValue, presets };
}

function soundControl(kind: VideoSoundControl["kind"], defaultEnabled: boolean): VideoSoundControl {
  return {
    kind,
    label: kind === "keep_original_sound" ? "保留原声" : "生成声音",
    defaultEnabled,
    costHint: kind === "keep_original_sound" ? "原声策略会影响视频编辑/参考计费" : "开启声音可能增加生成费用",
  };
}

export function getVideoParameterCapabilities(
  modelId: VideoModelId,
  modeId: VideoGenerationModeId,
  _references: UnifiedVideoReference[] = [],
): VideoParameterCapabilities {
  void _references;
  const modelCapabilities = getVideoCapabilities(modelId);
  const base: VideoParameterCapabilities = {
    aspectRatios: modelCapabilities.aspectRatios,
    durationCapability: resolveVideoDurationCapability(modelCapabilities),
    resolutions: modelCapabilities.resolutions,
    supportsAspectRatio: true,
    supportsDuration: true,
  };

  if (modelId === "seedance-2.0" || modelId === "seedance-2.0-fast" || modelId === "seedance-2.0-mini") {
    return {
      ...base,
      aspectRatios: modeId === "text_to_video" || modeId === "multi_image_reference" ? STANDARD_RATIOS : SEEDANCE_IMAGE_RATIOS,
      durationCapability: durationRange(4, 15, 5, [4, 5, 8, 10, 15]),
      resolutions: modelId === "seedance-2.0-fast" || modelId === "seedance-2.0-mini" ? ["480p", "720p"] : ["480p", "720p", "1080p"],
      soundControl: soundControl("generate_audio", true),
    };
  }

  if (modelId === "seedance-1.5-pro") {
    return {
      ...base,
      aspectRatios: modeId === "text_to_video" ? STANDARD_RATIOS : SEEDANCE_IMAGE_RATIOS,
      durationCapability: durationRange(4, 12, 5, [4, 5, 8, 10, 12]),
      resolutions: ["480p", "720p", "1080p"],
      soundControl: soundControl("generate_audio", true),
    };
  }

  if (modelId === "doubao-seedance-1.0-pro-fast" || modelId === "seedance-1.0-pro") {
    return {
      ...base,
      aspectRatios: modeId === "text_to_video" ? STANDARD_RATIOS : SEEDANCE_IMAGE_RATIOS,
      durationCapability: { type: "presets", values: [4, 8, 12], defaultValue: 8 },
      resolutions: ["480p", "720p", "1080p"],
    };
  }

  if ((modelId === "kling-3.0" || modelId === "kling-3.0-motion" || modelId === "kling-2.6-motion") && modeId === "motion_control") {
    return {
      ...base,
      aspectRatios: [],
      durationCapability: undefined,
      resolutions: ["720p", "1080p"],
      soundControl: soundControl("keep_original_sound", true),
      supportsAspectRatio: false,
      supportsDuration: false,
    };
  }

  if (modelId === "kling-3.0") {
    return {
      ...base,
      aspectRatios: ["16:9", "9:16", "1:1"],
      durationCapability: durationRange(3, 15, 5, [3, 5, 8, 10, 15]),
      resolutions: ["720p", "1080p", "4k"],
      soundControl: soundControl("generate_audio", false),
    };
  }

  if (modelId === "happyhorse-1.1") {
    return {
      ...base,
      aspectRatios: modeId === "start_frame" ? [] : HAPPYHORSE_RATIOS,
      durationCapability: durationRange(3, 15, 5, [3, 5, 6, 8, 10, 15]),
      resolutions: ["720p", "1080p"],
      supportsAspectRatio: modeId !== "start_frame",
    };
  }

  if (modelId === "happyhorse-1.0") {
    if (modeId === "video_edit") {
      return {
        ...base,
        aspectRatios: [],
        durationCapability: undefined,
        resolutions: ["720p", "1080p"],
        soundControl: soundControl("keep_original_sound", false),
        supportsAspectRatio: false,
        supportsDuration: false,
      };
    }
    return {
      ...base,
      aspectRatios: modeId === "start_frame" ? [] : HAPPYHORSE_RATIOS,
      durationCapability: durationRange(3, 15, 5, [3, 5, 6, 8, 10, 15]),
      resolutions: ["720p", "1080p"],
      supportsAspectRatio: modeId !== "start_frame",
    };
  }

  if (modelId === "grok-imagine") {
    return {
      ...base,
      aspectRatios: modeId === "start_frame" ? ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "16:9", "9:16"] : GROK_RATIOS,
      durationCapability: modeId === "start_frame" ? durationRange(1, 15, 6, [1, 3, 6, 10, 15]) : durationRange(6, 30, 6),
      resolutions: ["480p", "720p"],
    };
  }

  if (modelId === "veo-3.1" || modelId === "veo-3.1-fast" || modelId === "veo-3.1-lite") {
    return {
      ...base,
      aspectRatios: modeId === "multi_image_reference" ? ["16:9"] : VEO_RATIOS,
      durationCapability: modeId === "multi_image_reference"
        ? { type: "presets", values: [8], defaultValue: 8 }
        : { type: "presets", values: [4, 6, 8], defaultValue: 4 },
      resolutions: ["720p", "1080p", "4k"],
    };
  }

  if (modelId === "gemini-omni") {
    return {
      ...base,
      aspectRatios: ["16:9", "9:16"],
      durationCapability: { type: "presets", values: [4, 6, 8, 10], defaultValue: 4 },
      resolutions: ["720p", "1080p", "4k"],
    };
  }

  return base;
}

export type VideoPromptModeId =
  | "free";

export const VIDEO_MODES: ReadonlyArray<{ id: VideoPromptModeId; label: string }> = [
  { id: "free", label: "自由模式" },
];



export interface VideoModelSettings {
  id: VideoModelId;
  label: string;
  baseUrl: string;
  apiKey: string;
  apiModelName: string;
  apiModelNameByMode: Partial<Record<VideoGenerationModeId, string>>;
  enabled: boolean;
  providerOptions: VideoProviderOptions;
}

export interface CustomVideoMode {
  id: string;
  label: string;
}

export interface VideoWorkspaceSettings {
  prompts: Record<string, string>;
  models: Record<VideoModelId, VideoModelSettings>;
  customModes: CustomVideoMode[];
  coverImageUrlByMode: Record<string, string>;
  promptTagsByMode: Record<string, string[]>;
  promptDescriptionsByMode: Record<string, string>;
  uiDefaults: {
    defaultModelId: VideoModelId;
    defaultModeByModel: Partial<Record<VideoModelId, VideoGenerationModeId>>;
    defaultAspectRatio: VideoAspectRatio;
    defaultDurationSeconds: number;
    defaultResolution: VideoResolution;
  };
}

type LegacyVideoModelId = "seedance-2.0" | "seedance-2.0-fast";
type LegacyVideoModelSettings = {
  id?: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
};

type LegacyVideoWorkspaceSettings = {
  prompts?: Record<string, string>;
  models?: Record<LegacyVideoModelId, LegacyVideoModelSettings>;
  customModes?: Array<{ id?: string; label?: string }>;
  customPresets?: unknown;
  presets?: unknown;
  coverImageUrlByMode?: unknown;
  promptTagsByMode?: unknown;
  promptDescriptionsByMode?: unknown;
};

function defaultModelSettings(modelId: VideoModelId): VideoModelSettings {
  const model = VIDEO_MODEL_REGISTRY[modelId];
  return {
    id: modelId,
    label: model.label,
    baseUrl: "",
    apiKey: "",
    apiModelName: model.defaultApiModelName,
    apiModelNameByMode: defaultVideoApiModelNameByMode(modelId),
    enabled: !isDisabledVideoModel(modelId),
    providerOptions: {},
  };
}

export function isVideoModelModeSupported(modelId: VideoModelId, modeId: VideoGenerationModeId): boolean {
  if (isDisabledVideoModel(modelId)) return false;
  return getVideoCapabilities(modelId).supportedModes.includes(modeId);
}

export function defaultVideoApiModelNameForMode(modelId: VideoModelId, modeId: VideoGenerationModeId): string {
  if (!isVideoModelModeSupported(modelId, modeId)) return "";
  if (modelId === "seedance-2.0" || modelId === "seedance-2.0-fast" || modelId === "seedance-2.0-mini") {
    const prefix =
      modelId === "seedance-2.0-fast"
        ? "bytedance/seedance2-0-fast"
        : modelId === "seedance-2.0-mini"
          ? "bytedance/seedance2-0-mini"
          : "bytedance/seedance2-0";
    if (modeId === "text_to_video") return `${prefix}-t2v`;
    if (modeId === "start_frame" || modeId === "start_end_frame") return `${prefix}-i2v`;
    if (modeId === "multi_image_reference") return `${prefix}-r2v`;
  }
  if (modelId === "seedance-1.5-pro") {
    if (modeId === "text_to_video") return "bytedance/seedance1-5-pro-t2v";
    if (modeId === "start_frame" || modeId === "start_end_frame") return "bytedance/seedance1-5-pro-i2v";
  }
  if (modelId === "doubao-seedance-1.0-pro-fast") {
    if (modeId === "text_to_video") return "bytedance/seedance1-0-pro-fast-t2v";
    if (modeId === "start_frame") return "bytedance/seedance1-0-pro-fast-i2v";
  }
  if (modelId === "seedance-1.0-pro") {
    if (modeId === "text_to_video") return "bytedance/seedance1-0-pro-t2v";
    if (modeId === "start_frame") return "bytedance/seedance1-0-pro-i2v";
  }
  if (modelId === "kling-3.0") {
    if (modeId === "motion_control") return "kling/v3-motion-control";
    if (modeId === "text_to_video" || modeId === "start_frame" || modeId === "start_end_frame" || modeId === "multi_image_reference") return "kling/v3";
  }
  if (modelId === "kling-3.0-motion" && modeId === "motion_control") return "kling/v3-motion-control";
  if (modelId === "kling-2.6-motion" && modeId === "motion_control") return "kling/v2-6-motion-control";
  if (modelId === "happyhorse-1.1" || modelId === "happyhorse-1.0") {
    const version = modelId === "happyhorse-1.0" ? "1-0" : "1-1";
    if (modeId === "text_to_video") return `happyhorse-${version}-t2v`;
    if (modeId === "start_frame") return `happyhorse-${version}-i2v`;
    if (modeId === "multi_image_reference") return `happyhorse-${version}-r2v`;
    if (modelId === "happyhorse-1.0" && modeId === "video_edit") return "happyhorse-1-0-video-edit";
  }
  if (modelId === "grok-imagine") {
    if (modeId === "text_to_video") return "grok-imagine/t2v";
    if (modeId === "start_frame") return "grok-imagine-video-1.5-preview";
  }
  if (modelId === "veo-3.1" || modelId === "veo-3.1-fast" || modelId === "veo-3.1-lite") {
    const prefix =
      modelId === "veo-3.1-fast"
        ? "google/veo3-1-fast"
        : modelId === "veo-3.1-lite"
          ? "google/veo3-1-lite"
          : "google/veo3-1";
    if (modeId === "text_to_video") return `${prefix}-t2v`;
    if (modeId === "start_frame" || modeId === "start_end_frame") return `${prefix}-i2v`;
    if (modeId === "multi_image_reference") return `${prefix}-r2v`;
  }
  if (modelId === "gemini-omni") {
    return "google/gemini-omni";
  }
  return getVideoModelDefinition(modelId).defaultApiModelName;
}

export function defaultVideoApiModelNameByMode(modelId: VideoModelId): Partial<Record<VideoGenerationModeId, string>> {
  const out: Partial<Record<VideoGenerationModeId, string>> = {};
  for (const mode of VIDEO_GENERATION_MODES) {
    const name = defaultVideoApiModelNameForMode(modelId, mode.id);
    if (name) out[mode.id] = name;
  }
  return out;
}

export function defaultVideoModePrompt(id: VideoPromptModeId): string {
  switch (id) {
    case "free":
      return "";
    default: {
      const _never: never = id;
      return _never;
    }
  }
}

export const DEFAULT_VIDEO_SETTINGS: VideoWorkspaceSettings = {
  customModes: [],
  coverImageUrlByMode: {},
  promptTagsByMode: {},
  promptDescriptionsByMode: {},
  prompts: {
    free: "",
  },
  models: Object.fromEntries(
    VIDEO_MODEL_ORDER.map((id) => [id, defaultModelSettings(id)]),
  ) as Record<VideoModelId, VideoModelSettings>,
  uiDefaults: {
    defaultModelId: "seedance-2.0",
    defaultModeByModel: {
      "seedance-2.0": "text_to_video",
      "seedance-2.0-fast": "text_to_video",
      "seedance-2.0-mini": "text_to_video",
      "seedance-1.5-pro": "text_to_video",
      "doubao-seedance-1.0-pro-fast": "text_to_video",
      "seedance-1.0-pro": "text_to_video",
      "kling-3.0": "text_to_video",
      "kling-2.6-motion": "motion_control",
      "happyhorse-1.1": "text_to_video",
      "happyhorse-1.0": "text_to_video",
      "grok-imagine": "text_to_video",
      "veo-3.1": "text_to_video",
      "veo-3.1-fast": "text_to_video",
      "veo-3.1-lite": "text_to_video",
      "gemini-omni": "text_to_video",
    },
    defaultAspectRatio: "16:9",
    defaultDurationSeconds: 5,
    defaultResolution: "480p",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeProviderOptions(value: unknown): VideoProviderOptions {
  if (!isObject(value)) return {};
  const out: VideoProviderOptions = {};
  for (const [key, raw] of Object.entries(value)) {
    if (
      raw === null ||
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean" ||
      typeof raw === "undefined"
    ) {
      out[key] = raw;
    }
  }
  return out;
}

function coerceApiModelNameByMode(
  modelId: VideoModelId,
  value: unknown,
  legacyModelName: unknown,
): Partial<Record<VideoGenerationModeId, string>> {
  const defaults = defaultVideoApiModelNameByMode(modelId);
  const row = isObject(value) ? value : {};
  const out: Partial<Record<VideoGenerationModeId, string>> = {};
  for (const mode of VIDEO_GENERATION_MODES) {
    if (!isVideoModelModeSupported(modelId, mode.id)) continue;
    const rawConfigured = row[mode.id];
    const configured = typeof rawConfigured === "string" ? rawConfigured.trim() : "";
    const legacy = typeof legacyModelName === "string" ? legacyModelName.trim() : "";
    out[mode.id] = normalizeLegacyVideoApiModelName(modelId, mode.id, configured || defaults[mode.id] || legacy);
  }
  return out;
}

function normalizeLegacyVideoApiModelName(
  modelId: VideoModelId,
  modeId: VideoGenerationModeId,
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return trimmed;
  if (modelId === "grok-imagine") {
    if (modeId === "text_to_video" && /^grok-imagine-text-to-video-beta$/i.test(trimmed)) return "grok-imagine/t2v";
    if (modeId === "start_frame" && /^grok-imagine-image-to-video-beta$/i.test(trimmed)) return "grok-imagine-video-1.5-preview";
  }
  if (modelId === "happyhorse-1.1") {
    if (modeId === "text_to_video" && /^happyhorse-1\.1-text-to-video$/i.test(trimmed)) return "happyhorse-1-1-t2v";
    if (modeId === "start_frame" && /^happyhorse-1\.1-image-to-video$/i.test(trimmed)) return "happyhorse-1-1-i2v";
    if (modeId === "multi_image_reference" && /^happyhorse-1\.1-reference-to-video$/i.test(trimmed)) return "happyhorse-1-1-r2v";
  }
  if (modelId === "happyhorse-1.0") {
    if (modeId === "text_to_video" && /^happyhorse-1\.0-text-to-video$/i.test(trimmed)) return "happyhorse-1-0-t2v";
    if (modeId === "start_frame" && /^happyhorse-1\.0-image-to-video$/i.test(trimmed)) return "happyhorse-1-0-i2v";
    if (modeId === "multi_image_reference" && /^happyhorse-1\.0-reference-to-video$/i.test(trimmed)) return "happyhorse-1-0-r2v";
    if (modeId === "video_edit" && /^happyhorse-1\.0-video-edit$/i.test(trimmed)) return "happyhorse-1-0-video-edit";
  }
  return trimmed;
}

function coerceVideoModelSettings(modelId: VideoModelId, value: unknown): VideoModelSettings {
  const baked = defaultModelSettings(modelId);
  const bakedApi = BAKED_VIDEO_MODEL_DEFAULTS[modelId as keyof typeof BAKED_VIDEO_MODEL_DEFAULTS];
  const row = isObject(value) ? value : {};
  const apiModelName = pickNonEmptyTrimmed(row.apiModelName ?? row.modelName, baked.apiModelName);
  const baseUrl = normalizeLegacyVideoBaseUrl(
    modelId,
    pickNonEmptyTrimmed(row.baseUrl, pickNonEmptyTrimmed(bakedApi?.baseUrl, baked.baseUrl)),
    bakedApi?.baseUrl,
  );
  return {
    id: modelId,
    label: pickNonEmptyTrimmed(row.label, baked.label),
    baseUrl,
    apiKey: pickNonEmptyTrimmed(row.apiKey, pickNonEmptyTrimmed(bakedApi?.apiKey, pickNonEmptyTrimmed(BAKED_LLM_SETTINGS.apiKey, baked.apiKey))),
    apiModelName,
    apiModelNameByMode: coerceApiModelNameByMode(modelId, row.apiModelNameByMode, apiModelName),
    enabled: isDisabledVideoModel(modelId) ? false : typeof row.enabled === "boolean" ? row.enabled : baked.enabled,
    providerOptions: sanitizeProviderOptions(row.providerOptions),
  };
}

function normalizeLegacyVideoBaseUrl(modelId: VideoModelId, baseUrl: string, bakedBaseUrl: string | undefined): string {
  const trimmed = baseUrl.trim();
  const baked = bakedBaseUrl?.trim();
  if (!baked) return trimmed;
  if (!isCrunTaskVideoModel(modelId)) return trimmed;
  if (/api\.evolink\.ai|seedanceapi\.org|grsai\.dakka\.com\.cn/i.test(trimmed)) return baked;
  return trimmed;
}

function isCrunTaskVideoModel(modelId: VideoModelId): boolean {
  return Boolean(BAKED_VIDEO_MODEL_DEFAULTS[modelId as keyof typeof BAKED_VIDEO_MODEL_DEFAULTS]?.baseUrl);
}

function coercePromptsRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const builtInIds = new Set<string>(VIDEO_MODES.map((mode) => mode.id));
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      if (builtInIds.has(key) || CUSTOM_VIDEO_MODE_ID_RE.test(key)) {
        out[key] = raw;
      }
    }
  }
  return out;
}

function coerceCoverImageUrlByMode(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

function coercePromptTagsByMode(value: unknown): Record<string, string[]> {
  if (!isObject(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    const tags = normalizePromptTags(raw);
    if (tags.length > 0) out[key] = tags;
  }
  return out;
}

function coercePromptDescriptionsByMode(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const description = String(raw ?? "").trim();
    if (description) out[key] = description;
  }
  return out;
}

function coerceVideoCustomModes(value: unknown): CustomVideoMode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CustomVideoMode[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const id = String(item.id ?? "").trim();
    const label = String(item.label ?? "").trim();
    if (!CUSTOM_VIDEO_MODE_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: label || id,
    });
  }
  return out;
}

function migrateCustomPresets(value: unknown): { modes: CustomVideoMode[]; prompts: Record<string, string> } {
  const modes: CustomVideoMode[] = [];
  const prompts: Record<string, string> = {};
  if (!Array.isArray(value)) return { modes, prompts };
  for (const item of value) {
    if (!isObject(item)) continue;
    const id = String(item.id ?? "").trim();
    const label = String(item.label ?? "").trim() || id;
    const promptTemplate = typeof item.promptTemplate === "string" ? item.promptTemplate : "";
    if (!id || !promptTemplate.trim()) continue;
    const nextId = CUSTOM_VIDEO_MODE_ID_RE.test(id) ? id : `custom_video_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    modes.push({ id: nextId, label });
    prompts[nextId] = promptTemplate;
  }
  return { modes, prompts };
}

function coerceUiDefaults(value: unknown): VideoWorkspaceSettings["uiDefaults"] {
  const row = isObject(value) ? value : {};
  const defaultModelId = VIDEO_MODEL_ORDER.includes(row.defaultModelId as VideoModelId)
    ? (row.defaultModelId as VideoModelId)
    : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultModelId;
  const defaultModeByModel: Partial<Record<VideoModelId, VideoGenerationModeId>> = {
    ...DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultModeByModel,
  };
  if (isObject(row.defaultModeByModel)) {
    for (const modelId of VIDEO_MODEL_ORDER) {
      const modeId = row.defaultModeByModel[modelId];
      if (VIDEO_GENERATION_MODES.some((mode) => mode.id === modeId)) {
        defaultModeByModel[modelId] = modeId as VideoGenerationModeId;
      }
    }
  }
  const defaultAspectRatio = (
    ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21", "3:2", "2:3", "4:5", "5:4", "adaptive", "keep_ratio"] as VideoAspectRatio[]
  ).includes(row.defaultAspectRatio as VideoAspectRatio)
    ? (row.defaultAspectRatio as VideoAspectRatio)
    : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultAspectRatio;
  const defaultDurationSeconds = Number(row.defaultDurationSeconds);
  const defaultResolution = (
    ["480p", "720p", "1080p", "4k"] as VideoResolution[]
  ).includes(row.defaultResolution as VideoResolution)
    ? (row.defaultResolution as VideoResolution)
    : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultResolution;
  return {
    defaultModelId,
    defaultModeByModel,
    defaultAspectRatio,
    defaultDurationSeconds:
      Number.isFinite(defaultDurationSeconds) && defaultDurationSeconds > 0
        ? defaultDurationSeconds
        : DEFAULT_VIDEO_SETTINGS.uiDefaults.defaultDurationSeconds,
    defaultResolution,
  };
}

function migrateLegacyPrompts(value: LegacyVideoWorkspaceSettings): { modes: CustomVideoMode[]; prompts: Record<string, string> } {
  const prompts = isObject(value.prompts) ? value.prompts : {};
  const customModes = Array.isArray(value.customModes) ? value.customModes : [];
  const builtInIds = new Set<string>(VIDEO_MODES.map((mode) => mode.id));
  const modes: CustomVideoMode[] = [];
  const outPrompts: Record<string, string> = {};

  for (const [legacyModeId, promptTemplateRaw] of Object.entries(prompts)) {
    const promptTemplate = String(promptTemplateRaw ?? "");
    if (!promptTemplate.trim()) continue;
    if (builtInIds.has(legacyModeId)) continue;
    const customMode = customModes.find((item) => String(item?.id ?? "").trim() === legacyModeId);
    const id = CUSTOM_VIDEO_MODE_ID_RE.test(legacyModeId)
      ? legacyModeId
      : `custom_video_${legacyModeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    modes.push({
      id,
      label: String(customMode?.label ?? legacyModeId).trim() || legacyModeId,
    });
    outPrompts[id] = promptTemplate;
  }

  return { modes, prompts: outPrompts };
}

export function mergeVideoSettings(partial: unknown): VideoWorkspaceSettings {
  const p = isObject(partial) ? partial : {};
  const legacy = p as LegacyVideoWorkspaceSettings;

  const models = Object.fromEntries(
    VIDEO_MODEL_ORDER.map((id) => {
      const legacyValue =
        id === "seedance-2.0" || id === "seedance-2.0-fast"
          ? legacy.models?.[id as LegacyVideoModelId]
          : undefined;
      return [id, coerceVideoModelSettings(id, p.models && isObject(p.models) ? p.models[id] ?? legacyValue : legacyValue)];
    }),
  ) as Record<VideoModelId, VideoModelSettings>;

  const migratedLegacy = migrateLegacyPrompts(legacy);
  const migratedCustomPresets = migrateCustomPresets(p.customPresets);
  const prompts = {
    ...DEFAULT_VIDEO_SETTINGS.prompts,
    ...coercePromptsRecord(p.prompts),
    ...migratedLegacy.prompts,
    ...migratedCustomPresets.prompts,
  };
  const customModes = [
    ...coerceVideoCustomModes(p.customModes),
    ...migratedLegacy.modes,
    ...migratedCustomPresets.modes,
  ].filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index);

  return {
    prompts,
    models,
    customModes,
    coverImageUrlByMode: coerceCoverImageUrlByMode(p.coverImageUrlByMode),
    promptTagsByMode: coercePromptTagsByMode(p.promptTagsByMode),
    promptDescriptionsByMode: coercePromptDescriptionsByMode(p.promptDescriptionsByMode),
    uiDefaults: coerceUiDefaults(p.uiDefaults),
  };
}

export function extractPromptPlaceholderOccurrences(tpl: string): string[] {
  return tpl.match(/\{\{[^}]+\}\}/g) ?? [];
}

export function placeholderInnerHint(token: string): string {
  const trimmed = token.trim();
  const m = trimmed.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return m?.[1]?.trim() ?? "";
}

export function composerSlotCountForTemplate(template: string): number {
  return Math.max(1, extractPromptPlaceholderOccurrences(template).length);
}

export function buildVideoPromptFromSlots(template: string, slotInputs: string[]): string {
  if (!template.trim()) return slotInputs.join("\n\n").trim();
  let i = 0;
  return template.replace(/\{\{[^}]+\}\}/g, () => slotInputs[i++] ?? "");
}

export function getVideoCapabilities(modelId: VideoModelId): VideoCapabilitySet {
  return getVideoModelDefinition(modelId).capabilities;
}

export function summarizeVideoReferences(references: UnifiedVideoReference[]): string[] {
  return references.map((item, index) => `${index + 1}. ${item.role}:${item.label ?? item.url}`);
}

export function defaultModeForModel(settings: VideoWorkspaceSettings, modelId: VideoModelId): VideoGenerationModeId {
  const configured = settings.uiDefaults.defaultModeByModel[modelId];
  if (configured && getVideoCapabilities(modelId).supportedModes.includes(configured)) return configured;
  return getVideoCapabilities(modelId).supportedModes[0] ?? "text_to_video";
}

export function newCustomVideoPresetId(): string {
  return `custom_video_${crypto.randomUUID()}`;
}

export const newCustomVideoModeId = newCustomVideoPresetId;

const CUSTOM_VIDEO_MODE_ID_RE = /^(custom_video_|user_preset_video_|community_)[a-zA-Z0-9_-]+$/;

export function isKnownVideoModeId(modeId: string, customModes: CustomVideoMode[] = []): boolean {
  const id = modeId.trim();
  if (!id || id === "free") return false;
  if (VIDEO_MODES.some((mode) => mode.id === id)) return true;
  return CUSTOM_VIDEO_MODE_ID_RE.test(id) && customModes.some((mode) => mode.id === id);
}

export function describeModelCapability(model: VideoModelDefinition): string {
  return model.capabilities.supportedModes.map((modeId) => VIDEO_MODE_LABELS[modeId]).join(" / ");
}
