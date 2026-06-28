export type VideoProviderId = "seedance" | "kling" | "happyhorse" | "grok" | "veo" | "gemini-omni";

export type VideoModelId =
  | "seedance-2.0"
  | "seedance-2.0-fast"
  | "seedance-2.0-mini"
  | "seedance-1.5-pro"
  | "doubao-seedance-1.0-pro-fast"
  | "seedance-1.0-pro"
  | "kling-3.0"
  | "kling-3.0-motion"
  | "kling-2.6-motion"
  | "happyhorse-1.1"
  | "happyhorse-1.0"
  | "grok-imagine"
  | "veo-3.1"
  | "veo-3.1-fast"
  | "veo-3.1-lite"
  | "gemini-omni";

export type VideoGenerationModeId =
  | "text_to_video"
  | "start_frame"
  | "start_end_frame"
  | "multi_image_reference"
  | "video_edit"
  | "motion_control";

export type VideoAspectRatio =
  | "auto"
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "21:9"
  | "9:21"
  | "3:2"
  | "2:3"
  | "4:5"
  | "5:4"
  | "adaptive"
  | "keep_ratio";

export type VideoResolution = "480p" | "720p" | "1080p" | "4k";

export type UnifiedVideoReferenceRole =
  | "start_frame"
  | "end_frame"
  | "image_reference"
  | "video_reference"
  | "audio_reference"
  | "motion_source_video";

export type UnifiedVideoReference = {
  role: UnifiedVideoReferenceRole;
  url: string;
  label?: string;
  mimeType?: string;
  durationSeconds?: number;
};

export type VideoProviderOptions = Record<string, string | number | boolean | null | undefined>;
export type VideoGrokImagineMode = "normal" | "fun" | "spicy";

export type UnifiedVideoGenerateRequest = {
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  prompt: string;
  durationSeconds: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  soundEnabled?: boolean;
  grokImagineMode?: VideoGrokImagineMode;
  references: UnifiedVideoReference[];
  providerOptions?: VideoProviderOptions;
};

export type VideoDurationCapability =
  | { type: "presets"; values: number[]; defaultValue: number }
  | { type: "range"; min: number; max: number; step: number; defaultValue: number; presets?: number[] }
  | { type: "recommended"; values: number[]; defaultValue: number };

export type VideoCapabilitySet = {
  supportedModes: VideoGenerationModeId[];
  aspectRatios: VideoAspectRatio[];
  durations: number[];
  durationCapability?: VideoDurationCapability;
  resolutions: VideoResolution[];
  maxImageReferences: number;
  maxVideoReferences: number;
  maxAudioReferences: number;
  supportsFirstLastFrames: boolean;
  supportsMotionControl: boolean;
  supportsNativeAudio: boolean;
  supportsVideoExtension: boolean;
  supportsMultipleImageReferences: boolean;
};

export type VideoSoundControlKind = "generate_audio" | "sound" | "keep_original_sound";

export type VideoSoundControl = {
  kind: VideoSoundControlKind;
  label: "生成声音" | "保留原声";
  defaultEnabled: boolean;
  costHint: string;
};

export type VideoParameterCapabilities = {
  aspectRatios: VideoAspectRatio[];
  durationCapability?: VideoDurationCapability;
  resolutions: VideoResolution[];
  soundControl?: VideoSoundControl;
  supportsAspectRatio: boolean;
  supportsDuration: boolean;
};

export type VideoPresetDefinition = {
  title: string;
  description: string;
  promptTemplate: string;
};

export type VideoModelDefinition = {
  id: VideoModelId;
  provider: VideoProviderId;
  label: string;
  defaultApiModelName: string;
  capabilities: VideoCapabilitySet;
};

export const VIDEO_GENERATION_MODES: ReadonlyArray<{ id: VideoGenerationModeId; label: string }> = [
  { id: "text_to_video", label: "文生视频" },
  { id: "start_frame", label: "首帧" },
  { id: "start_end_frame", label: "首尾帧" },
  { id: "multi_image_reference", label: "全能参考" },
  { id: "video_edit", label: "视频编辑" },
  { id: "motion_control", label: "动作控制" },
];

export const VIDEO_MODE_LABELS: Record<VideoGenerationModeId, string> = Object.fromEntries(
  VIDEO_GENERATION_MODES.map((item) => [item.id, item.label]),
) as Record<VideoGenerationModeId, string>;

function cleanDurationValues(values: number[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function defaultDurationFromValues(values: number[], fallback = 5): number {
  if (values.includes(fallback)) return fallback;
  return values[0] ?? fallback;
}

export function resolveVideoDurationCapability(capabilities: Pick<VideoCapabilitySet, "durations" | "durationCapability">): VideoDurationCapability {
  const capability = capabilities.durationCapability;
  if (capability?.type === "range") {
    const rawMin = Number(capability.min);
    const rawMax = Number(capability.max);
    const step = Number(capability.step);
    const min = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 1;
    const max = Number.isFinite(rawMax) && rawMax >= min ? rawMax : min;
    const defaultValue = Number.isFinite(capability.defaultValue) && capability.defaultValue >= min && capability.defaultValue <= max
      ? capability.defaultValue
      : min;
    const presets = cleanDurationValues(capability.presets ?? []).filter((value) => value >= min && value <= max);
    return {
      type: "range",
      min,
      max,
      step: Number.isFinite(step) && step > 0 ? step : 1,
      defaultValue,
      presets,
    };
  }

  if (capability?.type === "recommended") {
    const values = cleanDurationValues(capability.values);
    return {
      type: "recommended",
      values,
      defaultValue: values.includes(capability.defaultValue) ? capability.defaultValue : defaultDurationFromValues(values),
    };
  }

  if (capability?.type === "presets") {
    const values = cleanDurationValues(capability.values);
    return {
      type: "presets",
      values,
      defaultValue: values.includes(capability.defaultValue) ? capability.defaultValue : defaultDurationFromValues(values),
    };
  }

  const values = cleanDurationValues(capabilities.durations);
  return {
    type: "presets",
    values,
    defaultValue: defaultDurationFromValues(values),
  };
}

export function isVideoDurationSupported(value: number, capability: VideoDurationCapability): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (capability.type === "presets" || capability.type === "recommended") {
    return capability.values.includes(value);
  }
  if (value < capability.min || value > capability.max) return false;
  const steps = (value - capability.min) / capability.step;
  return Math.abs(steps - Math.round(steps)) < 1e-8;
}

export function normalizeVideoDuration(value: number, capability: VideoDurationCapability): number {
  if (isVideoDurationSupported(value, capability)) return value;
  if (isVideoDurationSupported(capability.defaultValue, capability)) return capability.defaultValue;
  if (capability.type === "range") return capability.min;
  return capability.values[0] ?? 5;
}
