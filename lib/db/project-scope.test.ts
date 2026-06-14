import { describe, expect, it } from "vitest";
import {
  applyProjectScope,
  normalizePageLimit,
  normalizeProjectId,
  projectIdFromRequest,
} from "@/lib/db/project-scope";

describe("project scope", () => {
  it("normalizes request project identifiers without inventing a scope", () => {
    expect(normalizeProjectId(" project-1 ")).toBe("project-1");
    expect(normalizeProjectId("")).toBeUndefined();
    expect(normalizeProjectId(undefined)).toBeUndefined();
    expect(normalizeProjectId(null)).toBeNull();
    expect(projectIdFromRequest(new Request("https://example.com/api?projectId=project-2"))).toBe("project-2");
  });

  it("applies explicit project and legacy-null filters", () => {
    const calls: unknown[][] = [];
    const query = {
      eq(...args: unknown[]) {
        calls.push(["eq", ...args]);
        return this;
      },
      is(...args: unknown[]) {
        calls.push(["is", ...args]);
        return this;
      },
    };

    expect(applyProjectScope(query, { projectId: "project-1" })).toBe(query);
    expect(applyProjectScope(query, { projectId: null })).toBe(query);
    expect(applyProjectScope(query, {})).toBe(query);
    expect(calls).toEqual([
      ["eq", "project_id", "project-1"],
      ["is", "project_id", null],
    ]);
  });

  it("keeps page sizes bounded", () => {
    expect(normalizePageLimit(undefined, 24)).toBe(24);
    expect(normalizePageLimit(0, 24)).toBe(1);
    expect(normalizePageLimit(1000, 24)).toBe(100);
  });
});
