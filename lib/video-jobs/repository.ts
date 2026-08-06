import { createHash, randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoGenerationJob, VideoJobRequestSnapshot } from "./types";

export function hashVideoJobCallbackToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createVideoJobCallbackToken(): string {
  return randomBytes(32).toString("base64url");
}

function mapJob(row: Record<string, unknown>): VideoGenerationJob {
  return {
    id: String(row.id), userId: String(row.user_id), projectId: row.project_id == null ? null : String(row.project_id),
    requestId: String(row.request_id), reservationId: row.reservation_id == null ? null : String(row.reservation_id),
    modelId: String(row.model_id), modeId: String(row.mode_id), provider: String(row.provider),
    providerTaskId: row.provider_task_id == null ? null : String(row.provider_task_id),
    status: row.status as VideoGenerationJob["status"], billingStatus: row.billing_status as VideoGenerationJob["billingStatus"],
    requestSnapshot: row.request_snapshot as VideoJobRequestSnapshot,
    result: row.result as Record<string, unknown> | null, error: row.error as Record<string, unknown> | null,
    nextPollAt: row.next_poll_at as string | null, submittedAt: row.submitted_at as string | null,
    providerCompletedAt: row.provider_completed_at as string | null, completedAt: row.completed_at as string | null,
    attemptCount: Number(row.attempt_count ?? 0), transientErrorCount: Number(row.transient_error_count ?? 0),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function createVideoGenerationJob(params: {
  admin: SupabaseClient; userId: string; projectId: string | null; requestId: string;
  reservationId: string | null; snapshot: VideoJobRequestSnapshot;
}): Promise<{ job: VideoGenerationJob; callbackToken: string; created: boolean }> {
  const existing = await params.admin.from("video_generation_jobs").select("*")
    .eq("user_id", params.userId).eq("request_id", params.requestId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { job: mapJob(existing.data), callbackToken: "", created: false };
  const callbackToken = createVideoJobCallbackToken();
  const row = {
    id: randomUUID(), user_id: params.userId, project_id: params.projectId, request_id: params.requestId,
    reservation_id: params.reservationId, model_id: params.snapshot.request.modelId, mode_id: params.snapshot.request.modeId,
    request_snapshot: params.snapshot, callback_token_hash: hashVideoJobCallbackToken(callbackToken),
  };
  const inserted = await params.admin.from("video_generation_jobs").insert(row).select("*").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await params.admin.from("video_generation_jobs").select("*")
        .eq("user_id", params.userId).eq("request_id", params.requestId).single();
      if (raced.error) throw raced.error;
      return { job: mapJob(raced.data), callbackToken: "", created: false };
    }
    throw inserted.error;
  }
  return { job: mapJob(inserted.data), callbackToken, created: true };
}

export async function getVideoGenerationJob(client: SupabaseClient, id: string): Promise<VideoGenerationJob | null> {
  const result = await client.from("video_generation_jobs").select("*").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapJob(result.data) : null;
}

export async function getVideoGenerationJobByRequest(
  client: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<VideoGenerationJob | null> {
  const result = await client.from("video_generation_jobs").select("*")
    .eq("user_id", userId).eq("request_id", requestId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mapJob(result.data) : null;
}

export async function listVideoGenerationJobs(client: SupabaseClient, params: { projectId?: string; active?: boolean; limit?: number }) {
  let query = client.from("video_generation_jobs").select("*").order("created_at", { ascending: false })
    .limit(Math.min(Math.max(params.limit ?? 50, 1), 100));
  if (params.projectId) query = query.eq("project_id", params.projectId);
  if (params.active) query = query.in("status", ["queued","submitted","running","monitoring_delayed","finalizing","needs_review"]);
  const result = await query;
  if (result.error) throw result.error;
  return (result.data ?? []).map(mapJob);
}

export async function claimDueVideoJobs(admin: SupabaseClient, workerId: string, limit = 10): Promise<VideoGenerationJob[]> {
  const result = await admin.rpc("claim_due_video_generation_jobs", { p_worker_id: workerId, p_limit: limit });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row: Record<string, unknown>) => mapJob(row));
}

export async function updateVideoJob(admin: SupabaseClient, id: string, values: Record<string, unknown>) {
  const result = await admin.from("video_generation_jobs").update({ ...values, locked_at: null, locked_by: null, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (result.error) throw result.error;
  return mapJob(result.data);
}

export async function wakeVideoJob(admin: SupabaseClient, id: string, token: string): Promise<boolean> {
  const result = await admin.rpc("wake_video_generation_job", { p_job_id: id, p_callback_token_hash: hashVideoJobCallbackToken(token) });
  if (result.error) throw result.error;
  return Boolean(result.data);
}
