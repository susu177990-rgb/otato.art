import type {
  UnifiedVideoReferenceRole,
  VideoAspectRatio,
  VideoGenerationModeId,
  VideoModelId,
  VideoResolution,
} from "@/lib/video-workspace";

export type VideoGenerationStatus = "success" | "error";

export interface VideoGalleryReferenceSummary {
  role: UnifiedVideoReferenceRole;
  label: string;
  url?: string;
}

export interface VideoGalleryRecord {
  id: string;
  createdAt: string;
  modelId: VideoModelId;
  modelName: string;
  modeId: VideoGenerationModeId;
  modeName: string;
  finalPrompt: string;
  userSlotInputs?: string[];
  aspectRatio?: VideoAspectRatio;
  durationSeconds: number;
  resolution?: VideoResolution;
  providerTaskId?: string;
  referencesSummary?: VideoGalleryReferenceSummary[];
  videoUrl?: string;
  status: VideoGenerationStatus;
  error?: string;
}
