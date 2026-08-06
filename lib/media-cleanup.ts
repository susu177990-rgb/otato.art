import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMediaObjects, deleteMediaPrefix, mediaObjectKeyFromPublicUrl } from "@/lib/media-storage";

type CleanupJob = {
  id: string;
  target: string;
  target_kind: "url" | "object" | "prefix";
  attempts: number;
};

export type MediaCleanupResult = { completed: number; failed: number; errors: string[] };

export async function runMediaCleanup(admin: SupabaseClient, limit = 100): Promise<MediaCleanupResult> {
  const result: MediaCleanupResult = { completed: 0, failed: 0, errors: [] };
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("media_cleanup_jobs")
    .select("id,target,target_kind,attempts")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw error;

  for (const job of (data ?? []) as CleanupJob[]) {
    const claimed = await admin
      .from("media_cleanup_jobs")
      .update({ status: "processing", attempts: job.attempts + 1, last_error: null })
      .eq("id", job.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimed.error || !claimed.data) continue;
    try {
      if (job.target_kind === "prefix") {
        await deleteMediaPrefix(job.target);
      } else {
        const key = job.target_kind === "url" ? mediaObjectKeyFromPublicUrl(job.target) : job.target;
        if (key) await deleteMediaObjects([key]);
      }
      const completed = await admin.from("media_cleanup_jobs").update({
        status: "completed", completed_at: new Date().toISOString(), last_error: null,
      }).eq("id", job.id);
      if (completed.error) throw completed.error;
      result.completed += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "unknown media cleanup error";
      const attempts = job.attempts + 1;
      const retryMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
      await admin.from("media_cleanup_jobs").update({
        status: "failed",
        last_error: message.slice(0, 2000),
        next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
      }).eq("id", job.id);
      result.failed += 1;
      result.errors.push(`${job.id}: ${message}`);
    }
  }
  return result;
}
