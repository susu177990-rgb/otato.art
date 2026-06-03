import type { VideoAspectRatio, VideoDurationSeconds, VideoModelId } from "@/lib/video-workspace";

export type VideoGenerationStatus = "success" | "error";

export interface VideoGalleryRecord {
  id: string;
  createdAt: string;
  modeId: string;
  modeName: string;
  modelId: VideoModelId;
  modelName: string;
  finalPrompt: string;
  /** 按模版中 `{{…}}` 出现顺序保存的各槽输入 */
  userSlotInputs?: string[];
  aspectRatio: VideoAspectRatio;
  duration: VideoDurationSeconds;
  videoUrl?: string;
  status: VideoGenerationStatus;
  error?: string;
}

