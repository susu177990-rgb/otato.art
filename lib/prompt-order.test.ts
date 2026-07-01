import { describe, expect, it } from "vitest";
import { promotePromptToFront, promotePromptToLatestForReversedList } from "@/lib/prompt-order";

describe("prompt ordering", () => {
  it("moves the latest edited preset to the front for directly rendered lists", () => {
    expect(promotePromptToFront([{ id: "a" }, { id: "b" }, { id: "c" }], "b").map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("moves the latest edited mode to the end when the UI renders the list reversed", () => {
    const stored = promotePromptToLatestForReversedList([{ id: "a" }, { id: "b" }, { id: "c" }], "b");
    expect(stored.map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect([...stored].reverse().map((item) => item.id)).toEqual(["b", "c", "a"]);
  });
});
