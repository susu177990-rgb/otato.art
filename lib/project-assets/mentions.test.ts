import { describe, expect, it } from "vitest";
import { projectAssetsToMentionCandidates } from "./mentions";
import type { ProjectAsset } from "./types";

describe("project asset mention candidates", () => {
  it("creates single-media candidates with stable ids", () => {
    const candidates = projectAssetsToMentionCandidates([
      {
        id: "asset-1",
        projectId: "project-1",
        type: "scene",
        name: "月台",
        description: "午夜月台",
        tags: ["雨夜"],
        primaryImageUrl: "https://example.com/platform.png",
        referenceImageUrls: ["https://example.com/platform-ref.png"],
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
      } satisfies ProjectAsset,
    ]);

    expect(candidates).toEqual([
      {
        id: "asset-1",
        label: "月台",
        type: "project-asset",
        role: "image_reference",
        groupLabel: "场景",
        description: "午夜月台",
        thumbnailUrl: "https://example.com/platform.png",
        url: "https://example.com/platform.png",
        referenceUrls: [],
        nodeType: "image",
      },
    ]);
  });

  it("marks video assets as video references", () => {
    const [candidate] = projectAssetsToMentionCandidates([
      {
        id: "asset-2",
        projectId: "project-1",
        type: "prop",
        name: "片段",
        description: "",
        tags: ["动作"],
        primaryImageUrl: "https://example.com/clip.mp4",
        referenceImageUrls: [],
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
      } satisfies ProjectAsset,
    ]);

    expect(candidate).toMatchObject({
      id: "asset-2",
      role: "video_reference",
      referenceUrls: [],
      nodeType: "video",
      url: "https://example.com/clip.mp4",
    });
  });
});
