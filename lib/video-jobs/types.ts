import type { UnifiedVideoGenerateRequest } from "@/lib/video-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";

export const ACTIVE_VIDEO_JOB_STATUSES = ["queued", "submitted", "running", "monitoring_delayed", "finalizing"] as const;
export type VideoJobStatus = typeof ACTIVE_VIDEO_JOB_STATUSES[number] | "succeeded" | "failed" | "needs_review";
export type VideoJobBillingStatus = "reserved" | "capture_pending" | "captured" | "released" | "needs_review";

export type VideoJobRequestSnapshot = {
  request: UnifiedVideoGenerateRequest;
  galleryRecord?: VideoGalleryRecord;
  remoteVideoUrl?: string;
  canvas?: { boardId: string; nodeId: string };
};

export type VideoGenerationJob = {
  id: string;
  userId: string;
  projectId: string | null;
  requestId: string;
  reservationId: string | null;
  modelId: string;
  modeId: string;
  provider: string;
  providerTaskId: string | null;
  status: VideoJobStatus;
  billingStatus: VideoJobBillingStatus;
  requestSnapshot: VideoJobRequestSnapshot;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  nextPollAt: string | null;
  submittedAt: string | null;
  providerCompletedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  transientErrorCount: number;
  createdAt: string;
  updatedAt: string;
};

export function toPublicVideoJob(job: VideoGenerationJob) {
  const request = job.requestSnapshot.request;
  const previewUrl = request.references.find((reference) =>
    reference.role === "start_frame" || reference.role === "image_reference" ||
    reference.role === "video_reference" || reference.role === "motion_source_video",
  )?.url ?? null;
  return {
    id: job.id, requestId: job.requestId, projectId: job.projectId,
    modelId: job.modelId, modeId: job.modeId,
    durationSeconds: request.durationSeconds, previewUrl,
    status: job.status, providerTaskId: job.providerTaskId,
    result: job.result, error: job.error, nextPollAt: job.nextPollAt,
    billingStatus: job.billingStatus, createdAt: job.createdAt, updatedAt: job.updatedAt,
  };
}
