import { describe, expect, it } from "vitest";
import {
  WORKSPACE_MODE_DEFINITIONS,
  buildProjectWorkspaceHref,
  isWorkspaceMode,
} from "./workspace-modes";

describe("project workspace modes", () => {
  it("exposes the three supported modules in stable navigation order", () => {
    expect(WORKSPACE_MODE_DEFINITIONS.map(({ mode }) => mode)).toEqual([
      "chat",
      "image",
      "video",
    ]);
  });

  it("rejects unsupported route modes", () => {
    expect(isWorkspaceMode("chat")).toBe(true);
    expect(isWorkspaceMode("audio")).toBe(false);
    expect(isWorkspaceMode("")).toBe(false);
  });

  it("keeps the project id when switching modules", () => {
    expect(buildProjectWorkspaceHref("project / 01", "video")).toBe(
      "/projects/project%20%2F%2001/workspace/video",
    );
  });
});
