export type VideoProviderId = "seedance" | "kling" | "veo" | "gemini-omni";

export type VideoModelId =
  | "seedance-2.0"
  | "seedance-2.0-fast"
  | "seedance-1.5"
  | "kling-3.0"
  | "kling-2.6-motion"
  | "veo-3.1"
  | "veo-3.1-fast"
  | "gemini-omni";

export type VideoGenerationModeId =
  | "text_to_video"
  | "start_frame"
  | "start_end_frame"
  | "multi_image_reference"
  | "motion_control";

export type VideoAspectRatio =
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "21:9"
  | "9:21";

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
};

export type VideoProviderOptions = Record<string, string | number | boolean | null | undefined>;

export type UnifiedVideoGenerateRequest = {
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  prompt: string;
  durationSeconds: number;
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  references: UnifiedVideoReference[];
  providerOptions?: VideoProviderOptions;
};

export type VideoCapabilitySet = {
  supportedModes: VideoGenerationModeId[];
  aspectRatios: VideoAspectRatio[];
  durations: number[];
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
  { id: "motion_control", label: "动作控制" },
];

export const VIDEO_MODE_LABELS: Record<VideoGenerationModeId, string> = Object.fromEntries(
  VIDEO_GENERATION_MODES.map((item) => [item.id, item.label]),
) as Record<VideoGenerationModeId, string>;
