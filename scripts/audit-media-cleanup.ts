import "dotenv/config";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { runMediaCleanup } from "../lib/media-cleanup";

async function main() {
  const apply = process.argv.includes("--apply");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("media_cleanup_jobs")
    .select("status,attempts,last_error,next_attempt_at,source")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const jobs = data ?? [];
  const summary = jobs.reduce<Record<string, number>>((counts, job) => {
    const status = String(job.status || "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", summary, failed: jobs.filter((j) => j.status === "failed") }, null, 2));

  if (!apply) {
    console.log("Dry run only. Pass --apply to process due queued cleanup jobs; no database references or balances are modified.");
    return;
  }
  console.log(JSON.stringify(await runMediaCleanup(admin, 500), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
