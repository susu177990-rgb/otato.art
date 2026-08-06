import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260712211035_chat_conversation_integrity.sql"),
  "utf8",
);

describe("chat conversation integrity migration", () => {
  it("persists the image model preference and turn revision", () => {
    expect(migration).toMatch(/preferred_image_model_id\s+text/i);
    expect(migration).toMatch(/revision\s+bigint\s+not null/i);
  });

  it("enforces one request per conversation and user message", () => {
    expect(migration).toMatch(/unique\s*\(conversation_id, user_message_id\)/i);
    expect(migration).toMatch(/status in \('pending', 'finalizing', 'completed', 'failed'\)/i);
  });

  it("uses an invoker RPC to atomically append and deduplicate a turn", () => {
    expect(migration).toMatch(/append_chat_conversation_turn/i);
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toMatch(/jsonb_array_elements\(conversation\.messages\)/i);
    expect(migration).toMatch(/conversation\.user_id = \(select auth\.uid\(\)\)/i);
  });
});
