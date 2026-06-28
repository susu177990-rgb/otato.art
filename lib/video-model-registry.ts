import type {
  VideoCapabilitySet,
  VideoGenerationModeId,
  VideoModelDefinition,
  VideoModelId,
  VideoPresetDefinition,
} from "@/lib/video-core";

function preset(title: string, description: string, promptTemplate: string): VideoPresetDefinition {
  return { title, description, promptTemplate };
}

function model(
  row: Omit<VideoModelDefinition, "capabilities"> & {
    capabilities: VideoCapabilitySet;
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

const MULTI_IMAGE_PROMPT = `# 任务：全能参考视频
## 参考图主体关系
{{参考图关系与主次}}

## 动作与镜头
{{动作与镜头}}

## 风格与氛围
{{风格与氛围}}

## 约束
{{约束}}`;

const VIDEO_EDIT_PROMPT = `# 任务：视频编辑
## 原视频修改目标
{{修改目标}}

## 保留内容
{{保留内容}}

## 风格与约束
{{风格与约束}}`;

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
  "seedance-2.0-mini",
  "seedance-1.5-pro",
  "doubao-seedance-1.0-pro-fast",
  "seedance-1.0-pro",
  "kling-3.0",
  "kling-2.6-motion",
  "happyhorse-1.1",
  "happyhorse-1.0",
  "grok-imagine",
  "veo-3.1",
  "veo-3.1-fast",
  "veo-3.1-lite",
  "gemini-omni",
];

export const VIDEO_MODEL_REGISTRY: Record<VideoModelId, VideoModelDefinition> = {
  "seedance-2.0": model({
    id: "seedance-2.0",
    provider: "seedance",
    label: "Seedance 2.0",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive", "keep_ratio"],
      durations: [4, 5, 10, 15],
      durationCapability: { type: "range", min: 4, max: 15, step: 1, defaultValue: 5, presets: [4, 5, 10, 15] },
      resolutions: ["480p", "720p", "1080p"],
      maxImageReferences: 9,
      maxVideoReferences: 3,
      maxAudioReferences: 3,
      supportsFirstLastFrames: true,
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
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive", "keep_ratio"],
      durations: [4, 5, 10, 15],
      durationCapability: { type: "range", min: 4, max: 15, step: 1, defaultValue: 5, presets: [4, 5, 10, 15] },
      resolutions: ["480p", "720p"],
      maxImageReferences: 9,
      maxVideoReferences: 3,
      maxAudioReferences: 3,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "seedance-2.0-mini": model({
    id: "seedance-2.0-mini",
    provider: "seedance",
    label: "Seedance 2.0 Mini",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive", "keep_ratio"],
      durations: [4, 5, 10, 15],
      durationCapability: { type: "range", min: 4, max: 15, step: 1, defaultValue: 5, presets: [4, 5, 8, 10, 15] },
      resolutions: ["480p", "720p"],
      maxImageReferences: 9,
      maxVideoReferences: 3,
      maxAudioReferences: 3,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "seedance-1.5-pro": model({
    id: "seedance-1.5-pro",
    provider: "seedance",
    label: "Seedance 1.5 Pro",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive", "keep_ratio"],
      durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      durationCapability: { type: "range", min: 4, max: 12, step: 1, defaultValue: 5, presets: [4, 5, 8, 12] },
      resolutions: ["480p", "720p", "1080p"],
      maxImageReferences: 2,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: true,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "doubao-seedance-1.0-pro-fast": model({
    id: "doubao-seedance-1.0-pro-fast",
    provider: "seedance",
    label: "Seedance 1.0 Pro Fast",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive", "keep_ratio"],
      durations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      durationCapability: { type: "range", min: 2, max: 12, step: 1, defaultValue: 5, presets: [2, 5, 8, 12] },
      resolutions: ["480p", "720p", "1080p"],
      maxImageReferences: 1,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "seedance-1.0-pro": model({
    id: "seedance-1.0-pro",
    provider: "seedance",
    label: "Seedance 1.0 Pro",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive", "keep_ratio"],
      durations: [4, 8, 12],
      durationCapability: { type: "presets", values: [4, 8, 12], defaultValue: 8 },
      resolutions: ["480p", "720p", "1080p"],
      maxImageReferences: 1,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "kling-3.0": model({
    id: "kling-3.0",
    provider: "kling",
    label: "Kling 3.0",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference", "motion_control"],
      aspectRatios: ["16:9", "9:16", "1:1"],
      durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      durationCapability: { type: "range", min: 3, max: 15, step: 1, defaultValue: 5, presets: [3, 5, 10, 15] },
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 3,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: true,
      supportsMotionControl: true,
      supportsNativeAudio: true,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "kling-3.0-motion": model({
    id: "kling-3.0-motion",
    provider: "kling",
    label: "Kling 3.0 Motion Control",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["motion_control"],
      aspectRatios: [],
      durations: [],
      resolutions: ["720p", "1080p"],
      maxImageReferences: 1,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: true,
      supportsNativeAudio: true,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "kling-2.6-motion": model({
    id: "kling-2.6-motion",
    provider: "kling",
    label: "Kling 2.6 Motion Control",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["motion_control"],
      aspectRatios: [],
      durations: [],
      resolutions: ["720p", "1080p"],
      maxImageReferences: 1,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: true,
      supportsNativeAudio: true,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "happyhorse-1.1": model({
    id: "happyhorse-1.1",
    provider: "happyhorse",
    label: "HappyHorse 1.1",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"],
      durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      durationCapability: { type: "range", min: 3, max: 15, step: 1, defaultValue: 5, presets: [3, 5, 10, 15] },
      resolutions: ["720p", "1080p"],
      maxImageReferences: 9,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "happyhorse-1.0": model({
    id: "happyhorse-1.0",
    provider: "happyhorse",
    label: "HappyHorse 1.0",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "multi_image_reference", "video_edit"],
      aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"],
      durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      durationCapability: { type: "range", min: 3, max: 15, step: 1, defaultValue: 5, presets: [3, 5, 10, 15] },
      resolutions: ["720p", "1080p"],
      maxImageReferences: 9,
      maxVideoReferences: 1,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: true,
    },
  }),
  "grok-imagine": model({
    id: "grok-imagine",
    provider: "grok",
    label: "Grok Imagine",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame"],
      aspectRatios: ["16:9", "9:16", "1:1", "3:2", "2:3"],
      durations: [6, 12, 18, 24, 30],
      durationCapability: { type: "range", min: 6, max: 30, step: 1, defaultValue: 6 },
      resolutions: ["480p", "720p"],
      maxImageReferences: 1,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: false,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: false,
      supportsMultipleImageReferences: false,
    },
  }),
  "veo-3.1": model({
    id: "veo-3.1",
    provider: "veo",
    label: "Veo 3.1",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame"],
      aspectRatios: ["auto", "16:9", "9:16"],
      durations: [4, 6, 8],
      durationCapability: { type: "presets", values: [4, 6, 8], defaultValue: 4 },
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 3,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: true,
      supportsVideoExtension: true,
      supportsMultipleImageReferences: false,
    },
  }),
  "veo-3.1-fast": model({
    id: "veo-3.1-fast",
    provider: "veo",
    label: "Veo 3.1 Fast",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["auto", "16:9", "9:16"],
      durations: [4, 6, 8],
      durationCapability: { type: "presets", values: [4, 6, 8], defaultValue: 4 },
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 3,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
      supportsFirstLastFrames: true,
      supportsMotionControl: false,
      supportsNativeAudio: false,
      supportsVideoExtension: true,
      supportsMultipleImageReferences: true,
    },
  }),
  "veo-3.1-lite": model({
    id: "veo-3.1-lite",
    provider: "veo",
    label: "Veo 3.1 Lite",
    defaultApiModelName: "",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["auto", "16:9", "9:16"],
      durations: [4, 6, 8],
      durationCapability: { type: "presets", values: [4, 6, 8], defaultValue: 4 },
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 3,
      maxVideoReferences: 0,
      maxAudioReferences: 0,
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
    defaultApiModelName: "google/gemini-omni",
    capabilities: {
      supportedModes: ["text_to_video", "start_frame", "start_end_frame", "multi_image_reference"],
      aspectRatios: ["16:9", "9:16"],
      durations: [4, 6, 8, 10],
      durationCapability: { type: "presets", values: [4, 6, 8, 10], defaultValue: 4 },
      resolutions: ["720p", "1080p", "4k"],
      maxImageReferences: 7,
      maxVideoReferences: 1,
      maxAudioReferences: 0,
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
    multi_image_reference: preset("Seedance 2.0 · 全能参考", "全能参考视频", MULTI_IMAGE_PROMPT),
  },
  "seedance-2.0-fast": {
    text_to_video: preset("Seedance 2.0 Fast · 文生视频", "快速文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 2.0 Fast · 首帧", "快速首帧图生视频", START_FRAME_PROMPT),
    multi_image_reference: preset("Seedance 2.0 Fast · 全能参考", "快速全能参考视频", MULTI_IMAGE_PROMPT),
  },
  "seedance-2.0-mini": {
    text_to_video: preset("Seedance 2.0 Mini · 文生视频", "轻量快速文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 2.0 Mini · 首帧", "轻量快速首帧图生视频", START_FRAME_PROMPT),
    multi_image_reference: preset("Seedance 2.0 Mini · 全能参考", "轻量快速全能参考视频", MULTI_IMAGE_PROMPT),
  },
  "seedance-1.5-pro": {
    text_to_video: preset("Seedance 1.5 Pro · 文生视频", "1.5 Pro 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 1.5 Pro · 首帧", "1.5 Pro 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Seedance 1.5 Pro · 首尾帧", "1.5 Pro 首尾帧视频", START_END_FRAME_PROMPT),
  },
  "doubao-seedance-1.0-pro-fast": {
    text_to_video: preset("Seedance 1.0 Pro Fast · 文生视频", "1.0 Pro Fast 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 1.0 Pro Fast · 首帧", "1.0 Pro Fast 首帧图生视频", START_FRAME_PROMPT),
  },
  "seedance-1.0-pro": {
    text_to_video: preset("Seedance 1.0 Pro · 文生视频", "1.0 Pro 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Seedance 1.0 Pro · 首帧", "1.0 Pro 首帧图生视频", START_FRAME_PROMPT),
  },
  "kling-3.0": {
    text_to_video: preset("Kling 3.0 · 文生视频", "Kling 3.0 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Kling 3.0 · 首帧", "Kling 3.0 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Kling 3.0 · 首尾帧", "Kling 3.0 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Kling 3.0 · 全能参考", "Kling 3.0 图片元素参考视频", MULTI_IMAGE_PROMPT),
    motion_control: preset("Kling 3.0 · 动作迁移", "Kling 3.0 参考图 + 动作视频迁移", MOTION_CONTROL_PROMPT),
  },
  "kling-3.0-motion": {},
  "kling-2.6-motion": {
    motion_control: preset("Kling 2.6 Motion · 动作迁移", "Kling 2.6 参考图 + 动作视频迁移", MOTION_CONTROL_PROMPT),
  },
  "happyhorse-1.1": {
    text_to_video: preset("HappyHorse 1.1 · 文生视频", "1.1 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("HappyHorse 1.1 · 首帧", "1.1 单图首帧视频", START_FRAME_PROMPT),
  },
  "happyhorse-1.0": {
    text_to_video: preset("HappyHorse 1.0 · 文生视频", "1.0 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("HappyHorse 1.0 · 首帧", "1.0 单图首帧视频", START_FRAME_PROMPT),
    video_edit: preset("HappyHorse 1.0 · 视频编辑", "1.0 基于原视频编辑", VIDEO_EDIT_PROMPT),
  },
  "grok-imagine": {
    text_to_video: preset("Grok Imagine · 文生视频", "Grok Imagine 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Grok Imagine · 单图", "Grok Imagine 单图图生视频", START_FRAME_PROMPT),
  },
  "veo-3.1": {
    text_to_video: preset("Veo 3.1 · 文生视频", "Veo 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Veo 3.1 · 首帧", "Veo 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Veo 3.1 · 首尾帧", "Veo 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Veo 3.1 · 全能参考", "Veo 图片参考视频", MULTI_IMAGE_PROMPT),
  },
  "veo-3.1-fast": {
    text_to_video: preset("Veo 3.1 Fast · 文生视频", "Veo Fast 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Veo 3.1 Fast · 首帧", "Veo Fast 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Veo 3.1 Fast · 首尾帧", "Veo Fast 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Veo 3.1 Fast · 全能参考", "Veo Fast 图片参考视频", MULTI_IMAGE_PROMPT),
  },
  "veo-3.1-lite": {
    text_to_video: preset("Veo 3.1 Lite · 文生视频", "Veo Lite 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Veo 3.1 Lite · 首帧", "Veo Lite 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Veo 3.1 Lite · 首尾帧", "Veo Lite 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Veo 3.1 Lite · 全能参考", "Veo Lite 图片参考视频", MULTI_IMAGE_PROMPT),
  },
  "gemini-omni": {
    text_to_video: preset("Gemini Omni · 文生视频", "Gemini Omni 文生视频", TEXT_TO_VIDEO_PROMPT),
    start_frame: preset("Gemini Omni · 首帧", "Gemini Omni 首帧图生视频", START_FRAME_PROMPT),
    start_end_frame: preset("Gemini Omni · 首尾帧", "Gemini Omni 首尾帧视频", START_END_FRAME_PROMPT),
    multi_image_reference: preset("Gemini Omni · 全能参考", "Gemini Omni 多模态参考视频", MULTI_IMAGE_PROMPT),
  },
};

export function getVideoModelDefinition(modelId: VideoModelId): VideoModelDefinition {
  return VIDEO_MODEL_REGISTRY[modelId];
}
