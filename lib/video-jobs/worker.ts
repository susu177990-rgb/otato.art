import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureCreditReservation, markCreditReservationCapturePending, releaseCreditReservation } from "@/lib/credits/accounts";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { finalizeUnifiedVideoTask, getUnifiedVideoTaskProviderConfig, pollCrunVideoTask, VideoGenerationError } from "@/lib/video-generation-service";
import { sanitizeVideoGalleryRecordForStorage } from "@/lib/video-gallery-record-storage";
import { claimDueVideoJobs, updateVideoJob } from "./repository";
import type { VideoGenerationJob } from "./types";
import { getCanvasBoard, updateCanvasBoard } from "@/lib/canvas/board-store";

const DELAYED_AFTER_MS = 20 * 60_000;
const REVIEW_AFTER_MS = 24 * 60 * 60_000;

export function nextVideoJobPollDelayMs(ageMs: number, transientErrors: number): number {
  if (transientErrors > 0) return Math.min(15_000 * 2 ** Math.min(transientErrors, 6), 15 * 60_000);
  return ageMs >= DELAYED_AFTER_MS ? 2 * 60_000 : 20_000;
}

function isoAfter(ms: number) { return new Date(Date.now() + ms).toISOString(); }
function errorJson(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error), at: new Date().toISOString() };
}

async function updateCanvasNodeForJob(
  admin: SupabaseClient,
  job: VideoGenerationJob,
  metadata: Record<string, unknown>,
) {
  const canvas = job.requestSnapshot.canvas;
  if (!canvas) return;
  const scope = job.projectId === null ? {} : { projectId: job.projectId };
  const board = await getCanvasBoard(admin, canvas.boardId, scope);
  if (!board) return;
  const target = board.nodes.find((node) => node.id === canvas.nodeId);
  if (target?.metadata?.videoJobId !== job.id) return;
  await updateCanvasBoard(admin, board.id, {
    data: {
      nodes: board.nodes.map((node) => node.id === canvas.nodeId
        ? { ...node, metadata: { ...node.metadata, ...metadata } }
        : node),
      connections: board.connections,
      viewport: board.viewport,
      snapToGrid: board.snapToGrid,
    },
  }, scope);
}
function isTransientPollError(error: unknown) {
  return !(error instanceof VideoGenerationError) || error.upstreamStatus == null || error.upstreamStatus === 429 || error.upstreamStatus >= 500;
}

async function finalizeJob(admin: SupabaseClient, job: VideoGenerationJob) {
  const remoteVideoUrl = String(job.requestSnapshot.remoteVideoUrl ?? "");
  if (!job.providerTaskId || !remoteVideoUrl) throw new Error("任务缺少上游结果，无法保存");
  const existingVideoUrl = typeof job.result?.videoUrl === "string" ? job.result.videoUrl : "";
  const result = existingVideoUrl
    ? { providerTaskId: job.providerTaskId, videoUrl: existingVideoUrl }
    : await finalizeUnifiedVideoTask({ supabase: admin, userId: job.userId, providerTaskId: job.providerTaskId, remoteVideoUrl, objectId: job.id });

  const gallery = job.requestSnapshot.galleryRecord;
  if (gallery) {
    const stored = sanitizeVideoGalleryRecordForStorage({ ...gallery, id: gallery.id || job.id, providerTaskId: job.providerTaskId, videoUrl: result.videoUrl, status: "success", error: undefined });
    const insert = await admin.from("video_gallery_records").upsert({
      id: stored.id, user_id: job.userId, project_id: job.projectId, data: stored, created_at: stored.createdAt,
    }, { onConflict: "id" });
    if (insert.error) throw insert.error;
  }

  await updateCanvasNodeForJob(admin, job, {
    videoUrl: result.videoUrl,
    previewVideoUrl: result.videoUrl,
    status: "success",
    lastRunAt: new Date().toISOString(),
    lastError: undefined,
  });

  if (job.reservationId) {
    await markCreditReservationCapturePending({ reservationId: job.reservationId, resultRef: result.videoUrl, metadata: { providerTaskId: job.providerTaskId, videoJobId: job.id } });
    try {
      await captureCreditReservation({ reservationId: job.reservationId, resultRef: result.videoUrl, metadata: { providerTaskId: job.providerTaskId, videoJobId: job.id } });
    } catch (error) {
      await updateVideoJob(admin, job.id, { status: "finalizing", billing_status: "capture_pending", result, error: errorJson(error), next_poll_at: isoAfter(60_000) });
      return "capture_pending" as const;
    }
  }
  await updateVideoJob(admin, job.id, { status: "succeeded", billing_status: job.reservationId ? "captured" : job.billingStatus, result, error: null, completed_at: new Date().toISOString(), next_poll_at: null });
  return "succeeded" as const;
}

export async function processVideoJob(admin: SupabaseClient, job: VideoGenerationJob) {
  if (job.status === "finalizing") return finalizeJob(admin, job);
  if (!job.providerTaskId) {
    await updateVideoJob(admin, job.id, { status: "needs_review", billing_status: "needs_review", error: { message: "已认领任务缺少 providerTaskId" }, next_poll_at: null });
    return "needs_review" as const;
  }
  const submittedAt = Date.parse(job.submittedAt ?? job.createdAt);
  const ageMs = Math.max(0, Date.now() - submittedAt);
  if (ageMs >= REVIEW_AFTER_MS) {
    await updateVideoJob(admin, job.id, { status: "needs_review", billing_status: "needs_review", error: { message: "上游任务超过 24 小时仍无终态" }, next_poll_at: null });
    return "needs_review" as const;
  }
  try {
    const snapshot = await getWorkspaceSnapshot(admin);
    const config = getUnifiedVideoTaskProviderConfig({ workspaceSnapshot: snapshot, request: job.requestSnapshot.request });
    const polled = await pollCrunVideoTask({ ...config, providerTaskId: job.providerTaskId });
    if (polled.state === "failed") {
      if (job.reservationId) await releaseCreditReservation({ reservationId: job.reservationId, reason: polled.message, metadata: { videoJobId: job.id, providerTaskId: job.providerTaskId } });
      await updateCanvasNodeForJob(admin, job, { status: "error", lastError: polled.message, lastRunAt: new Date().toISOString() });
      await updateVideoJob(admin, job.id, { status: "failed", billing_status: job.reservationId ? "released" : job.billingStatus, error: { message: polled.message, providerStatus: polled.providerStatus }, completed_at: new Date().toISOString(), next_poll_at: null });
      return "failed" as const;
    }
    if (polled.state === "succeeded") {
      const requestSnapshot = { ...job.requestSnapshot, remoteVideoUrl: polled.remoteVideoUrl };
      const finalizing = await updateVideoJob(admin, job.id, { status: "finalizing", request_snapshot: requestSnapshot, provider_completed_at: new Date().toISOString(), transient_error_count: 0, next_poll_at: new Date().toISOString(), error: null });
      return finalizeJob(admin, finalizing);
    }
    await updateVideoJob(admin, job.id, { status: ageMs >= DELAYED_AFTER_MS ? "monitoring_delayed" : "running", transient_error_count: 0, error: null, next_poll_at: isoAfter(nextVideoJobPollDelayMs(ageMs, 0)) });
    return "pending" as const;
  } catch (error) {
    if (!isTransientPollError(error)) {
      await updateVideoJob(admin, job.id, { status: "needs_review", billing_status: "needs_review", error: errorJson(error), next_poll_at: null });
      return "needs_review" as const;
    }
    const errors = job.transientErrorCount + 1;
    await updateVideoJob(admin, job.id, { status: ageMs >= DELAYED_AFTER_MS ? "monitoring_delayed" : "running", transient_error_count: errors, error: errorJson(error), next_poll_at: isoAfter(nextVideoJobPollDelayMs(ageMs, errors)) });
    return "retrying" as const;
  }
}

export async function runVideoJobWorker(admin: SupabaseClient, options: { limit?: number; workerId?: string } = {}) {
  const workerId = options.workerId ?? `video-worker:${randomUUID()}`;
  const jobs = await claimDueVideoJobs(admin, workerId, options.limit ?? 10);
  const counts: Record<string, number> = {};
  for (const job of jobs) {
    const outcome = await processVideoJob(admin, job).catch(() => "worker_error" as const);
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return { workerId, claimed: jobs.length, outcomes: counts };
}
