import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260713090200_media_cleanup_consistency.sql"),
  "utf8",
).toLowerCase();

describe("durable media cleanup migration", () => {
  it("persists retryable cleanup jobs with an idempotent open-job key", () => {
    expect(sql).toContain("create table if not exists public.media_cleanup_jobs");
    expect(sql).toContain("media_cleanup_jobs_open_target_idx");
    expect(sql).toContain("next_attempt_at");
  });

  it("atomically couples gallery replacement and project deletion to cleanup enqueue", () => {
    expect(sql).toContain("function public.finalize_gallery_replacement");
    expect(sql).toContain("function public.delete_gallery_record_with_cleanup");
    expect(sql).toContain("function public.delete_project_with_media_cleanup");
    expect(sql).toMatch(/enqueue_media_cleanup_job[\s\S]+delete from public\.projects/);
  });

  it("does not grant mutation access to anonymous users", () => {
    expect(sql).toContain("revoke all on function public.enqueue_media_cleanup_job");
    expect(sql).not.toMatch(/grant execute on function public\.enqueue_media_cleanup_job[^;]+authenticated/);
  });
});
