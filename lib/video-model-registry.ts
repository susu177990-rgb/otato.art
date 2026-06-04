import type {
  VideoAspectRatio,
  VideoGenerationModeId,
  VideoModelDefinition,
  VideoModelId,
  VideoPresetDefinition,
  VideoResolution,
} from "@/lib/video-core";

function preset(title: string, description: string, promptTemplate: string): VideoPresetDefinition {
  return { title, description, promptTemplate };
}

function model(
  row: Omit<VideoModelDefinition, "capabilities"> & {
    capabilities: {
      supportedModes: VideoGenerationModeId[];
      aspectRatios: VideoAspectRatio[];
      durations: number[];
      resolutions: VideoResolution[];
      maxImageReferences: number;
      supportsFirstLastFrames: boolean;
      supportsMotionControl: boolean;
      supportsNativeAudio: boolean;
      supportsVideoExtension: boolean;
      supportsMultipleImageReferences: boolean;
    };
  },
): VideoModelDefinition {
  return row;
}

const TEXT_TO_VIDEO_PROMPT = `# 任务：文生视频
## 主体与动作
{{主体与动作}}

## 镜头语言
{{镜头语言}}

## 风格与氛围
{{风格与氛围}}

## 约束
{{约束}}`;

const START_FRAME_PROMPT = `# 任务：首帧图生视频
## 首帧画面将作为视觉起点
{{动作与镜头发展}}

## 风格与氛围
{{风格与氛围}}

## 约束
{{约束}}`;

const START_END_FRAME_PROMPT = `# 任务：首尾帧视频
## 从首帧推进到尾帧
{{从首帧到尾帧的动作演进}}

## 镜头节奏
{{镜头节奏}}

## 约束
{{约束}}`;

const MULTI_IMAGE_PROMPT = `# 任务：多图参考视频
## 参考图主体关系
{{参考图关系与主次}}

## 动作与镜头
{{动作与镜头}}

## 风格与氛围
{{风格与氛围}}

## 约束
{{约束}}`;

const MOTION_CONTROL_PROMPT = `# 任务：动作控制视频
## 主体表现
{{主体表现}}

## 参考动作迁移要求
{{动作迁移要求}}

## 镜头与风格
{{镜头与风格}}

## 约束
{{约束}}`;

export const VIDEO_MODEL_ORDER: VideoModelId[] = [
  "seedance-2.0",
  "seedance-2.0-fast",
  "seedance-1.5",
  "kling-3.0",
  "kling-2.6-motion",
  "veo-3.1",
  "veo-3.1-fast",
  "gemini-omni",
];

export const VIDEO_MODEL_REGISTRY: Record<VideoModelId, VideoModelDefinition> = {
  "seedance-2.0": model({
    id: "seedance-2.0",
    provider: "seedance",
    label: "Seedance 2.0",
    defaultApiModelName: "seedance-2.0",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "4:3", "3:4"],
      durations: [5, 10, 15],
      resolutions: ["1080p"],
      maxImageReferences: 4,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "seedance-2.0-fast": model({
    id: "seedance-2.0-fast",
    provider: "seedance",
    label: "Seedance 2.0 Fast",
    defaultApiModelName: "seedance-2.0-fast",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "4:3", "3:4"],
      durations: [5, 10, 15],
      resolutions: ["1080p"],
      maxImageReferences: 4,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "seedance-1.5": model({
    id: "seedance-1.5",
    provider: "seedance",
    label: "Seedance 1.5",
    defaultApiModelName: "seedance-1.5",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame"],
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
      durations: [4, 8, 12],
      resolutions: ["480p", "720p"],
      maxImageReferences: 1,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: true,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "kling-3.0": model({
    id: "kling-3.0",
    provider: "kling",
    label: "可灵 3.0",
    defaultApiModelName: "kling-v3",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "1:1"],
      durations: [5, 10, 15],
      resolutions: ["720p", "1080p"],
      maxImageReferences: 4,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: true,
      supportsVideoExtension: true,
      supportsMultipleImageReferences: true,
    },
  }),
  "kling-2.6-motion": model({
    id: "kling-2.6-motion",
    provider: "kling",
    label: "可灵 2.6 动作控制",
    defaultApiModelName: "kling-v2-6",
    capabilities: {
      supportedModes: ["motion_control"],
      aspectRatios: ["16:9", "9:16", "1:1"],
      durations: [5],
      resolutions: ["720p", "1080p"],
      maxImageReferences: 1,
      supportsFirstLastFrames: false,
      supportsMotionControl: true,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "veo-3.1": model({
    id: "veo-3.1",
    provider: "veo",
    label: "Veo 3.1",
    defaultApiModelName: "veo-3.1-generate-001",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16"],
      durations: [4, 6, 8],
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 3,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: true,
      supportsVideoExtension: true,
      supportsMultipleImageReferences: true,
    },
  }),
  "veo-3.1-fast": model({
    id: "veo-3.1-fast",
    provider: "veo",
    label: "Veo 3.1 Fast",
    defaultApiModelName: "veo-3.1-fast-generate-001",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16"],
      durations: [4, 6, 8],
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 3,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: true,
      supportsMultipleImageReferences: true,
    },
  }),
  "gemini-omni": model({
    id: "gemini-omni",
    provider: "gemini-omni",
    label: "Gemini Omni",
    defaultApiModelName: "gemini-omni",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16"],
      durations: [4, 6, 8],
      resolutions: ["720p", "1080p"],
      maxImageReferences: 3,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: true,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
};

export const DEFAULT_VIDEO_PRESETS: Record<
  VideoModelId,
  Partial<Record<VideoGenerationModeId, VideoPresetDefinition>>
> = {
  "seedance-2.0": {
    text_to_video: preset("Seedance 2.0 · 文生视频", "电影镜头文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 2.0 · 首帧", "首帧图生视频", START_FRAME_PROMPT),
    multi_image_reference: preset("Seedance 2.0 · 多图参考", "多图参考视频", MULTI_IMAGE_PROMPT),
  },
  "seedance-2.0-fast": {
    text_to_video: preset("Seedance 2.0 Fast · 文生视频", "快速文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 2.0 Fast · 首帧", "快速首帧图生视频", START_FRAME_PROMPT),
    multi_image_reference: preset("Seedance 2.0 Fast · 多图参考", "快速多图参考视频", MULTI_IMAGE_PROMPT),
  },
  "seedance-1.5": {
    text_to_video: preset("Seedance 1.5 · 文生视频", "1.5 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 1.5 · 首帧", "1.5 首帧图生视频", START_FRAME_PROMPT),
  },
  "kling-3.0": {
    text_to_video: preset("可灵 3.0 · 文生视频", "可灵 3.0 单镜头/多镜头视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("可灵 3.0 · 首帧", "可灵 3.0 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("可灵 3.0 · 首尾帧", "可灵 3.0 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("可灵 3.0 · 多图参考", "可灵 3.0 元素一致性/多图参考", MULTI_IMAGE_PROMPT),
  },
  "kling-2.6-motion": {
    motion_control: preset("可灵 2.6 · 动作控制", "动作迁移视频", MOTION_CONTROL_PROMPT),
  },
  "veo-3.1": {
    text_to_video: preset("Veo 3.1 · 文生视频", "Veo 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Veo 3.1 · 首帧", "Veo 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Veo 3.1 · 首尾帧", "Veo 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Veo 3.1 · 多图参考", "Veo 最多三图参考", MULTI_IMAGE_PROMPT),
  },
  "veo-3.1-fast": {
    text_to_video: preset("Veo 3.1 Fast · 文生视频", "Veo Fast 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Veo 3.1 Fast · 首帧", "Veo Fast 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Veo 3.1 Fast · 首尾帧", "Veo Fast 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Veo 3.1 Fast · 多图参考", "Veo Fast 多图参考", MULTI_IMAGE_PROMPT),
  },
  "gemini-omni": {
    text_to_video: preset("Gemini Omni · 文生视频", "独立占位模型，等待可信契约", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Gemini Omni · 首帧", "独立占位模型，等待可信契约", START_FRAME_PROMPT),
    start_end_frame: preset("Gemini Omni · 首尾帧", "独立占位模型，等待可信契约", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Gemini Omni · 多图参考", "独立占位模型，等待可信契约", MULTI_IMAGE_PROMPT),
  },
};

export function getVideoModelDefinition(modelId: VideoModelId): VideoModelDefinition {
  return VIDEO_MODEL_REGISTRY[modelId];
}
