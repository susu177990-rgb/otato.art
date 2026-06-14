import { describe, expect, it, vi } from "vitest";
import type { CanvasBoardSummary } from "@/lib/canvas/types";
import {
  buildProjectCanvasDisplayTitle,
  findProjectCanvas,
  resolveProjectCanvasBoard,
} from "./project-canvas";

const project = {
  id: "project-1",
  name: "试播集",
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  currentStage: 0,
  messages: [],
  artifacts: [],
};

function board(id: string, projectId: string | null): CanvasBoardSummary {
  return {
    id,
    projectId,
    title: `${id} title`,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    nodeCount: 0,
    imageCount: 0,
    videoCount: 0,
    audioCount: 0,
  };
}

describe("project canvas", () => {
  it("uses a readable main board title", () => {
    expect(buildProjectCanvasDisplayTitle(project)).toBe("试播集 · 主画布");
  });

  it("finds only the board assigned to the project", () => {
    const boards = [
      board("other", "project-2"),
      board("main", "project-1"),
    ];
    expect(findProjectCanvas(boards, "project-1")?.id).toBe("main");
  });

  it("reuses an existing main board without creating another", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects/project-1") {
        return Response.json(project);
      }
      return Response.json({
        boards: [board("main", "project-1")],
      });
    });

    const result = await resolveProjectCanvasBoard("project-1", fetcher);

    expect(result.board.id).toBe("main");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("creates the main board when the project has none", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/projects/project-1") return Response.json(project);
      if (url === "/api/canvas-boards" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          projectId: "project-1",
          title: "试播集 · 主画布",
        });
        return Response.json(
          {
            ...board("created", "project-1"),
            nodes: [],
            connections: [],
            viewport: { x: 0, y: 0, k: 1 },
          },
          { status: 201 },
        );
      }
      return Response.json({ boards: [] });
    });

    const result = await resolveProjectCanvasBoard("project-1", fetcher);

    expect(result.board.id).toBe("created");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
