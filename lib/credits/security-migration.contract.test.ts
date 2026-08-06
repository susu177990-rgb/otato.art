import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("secure credit reservations migration", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260713090001_secure_credit_reservations.sql"),
    "utf8",
  );

  it("scopes request id uniqueness and lookup to the account", () => {
    expect(sql).toContain("unique (account_id, request_id)");
    expect(sql).toMatch(/where account_id = p_account_id and request_id = p_request_id/);
  });

  it("rejects duplicate generation instead of returning a reusable reservation", () => {
    expect(sql).toContain("IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("GENERATION_ALREADY_RUNNING");
    expect(sql).toContain("GENERATION_ALREADY_COMPLETED");
  });

  it("supports durable capture reconciliation", () => {
    expect(sql).toContain("capture_pending");
    expect(sql).toContain("mark_credit_reservation_capture_pending");
    expect(sql).toMatch(/status not in \('pending','capture_pending'\)/);
  });
});
