import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { submitUnifiedVideoTask } from "@/lib/video-generation-service";
import type { VideoGenerationJob } from "./types";
import { updateVideoJob } from "./repository";

export async function submitCreatedVideoJob(admin: SupabaseClient, job: VideoGenerationJob, callbackUrl?: string): Promise<VideoGenerationJob> {
  if (job.providerTaskId || job.status !== "queued") return job;
  const workspaceSnapshot = await getWorkspaceSnapshot(admin);
  const submitted = await submitUnifiedVideoTask({ workspaceSnapshot, request: job.requestSnapshot.request, callbackUrl });
  const now = new Date().toISOString();
  return updateVideoJob(admin, job.id, {
    provider: submitted.provider, provider_task_id: submitted.providerTaskId,
    status: "submitted", submitted_at: now, next_poll_at: now, error: null,
  });
}
