import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260713090400_video_generation_jobs.sql", "utf8");

describe("video generation jobs migration", () => {
  it("uses project text ids and account-scoped idempotency", () => {
    expect(sql).toMatch(/project_id text null references public\.projects\(id\)/);
    expect(sql).toContain("unique (user_id, request_id)");
  });

  it("protects rows and internal mutation RPCs", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("auth.uid()) = user_id");
    expect(sql).toContain("for update skip locked");
    expect(sql).toMatch(/revoke all on function public\.claim_due_video_generation_jobs[\s\S]+from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_due_video_generation_jobs[\s\S]+to service_role/);
  });
});
