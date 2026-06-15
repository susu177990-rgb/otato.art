import { describe, expect, it } from "vitest";
import {
  projectModeFromPathname,
  projectModeHref,
} from "./project-routes";

describe("project routes", () => {
  it("builds project mode links", () => {
    expect(projectModeHref("project 1", "workspace")).toBe("/projects/project%201/workspace/chat");
    expect(projectModeHref("project 1", "script")).toBe("/projects/project%201/script");
  });

  it("resolves the active mode and falls back to workspace", () => {
    expect(projectModeFromPathname("/projects/abc/workspace/video", "abc")).toBe("workspace");
    expect(projectModeFromPathname("/projects/abc/canvas", "abc")).toBe("canvas");
    expect(projectModeFromPathname("/projects/abc/unknown", "abc")).toBe("workspace");
    expect(projectModeFromPathname("/projects/abc", "abc")).toBe("workspace");
  });
});
