import { describe, expect, it } from "vitest";
import { mergeCanvasImageGenerationResult } from "@/lib/canvas/image-gen-runtime";
import type { CanvasBoard, CanvasNode } from "@/lib/canvas/types";

function imageNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: "image-1",
    type: "image",
    title: "图片",
    position: { x: 10, y: 20 },
    width: 320,
    height: 240,
    metadata: {
      prompt: "上海",
      imageGenerationRequestId: "request-1",
      status: "running",
    },
    ...overrides,
  };
}

function board(node: CanvasNode): CanvasBoard {
  return {
    id: "board-1",
    projectId: "project-1",
    title: "画布",
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    nodes: [node],
    connections: [],
    viewport: { x: 0, y: 0, k: 1 },
  };
}

describe("mergeCanvasImageGenerationResult", () => {
  it("writes the generated media while preserving newer node edits", () => {
    const current = imageNode({
      title: "用户改过的标题",
      position: { x: 80, y: 90 },
      metadata: {
        prompt: "用户后来修改的提示词",
        imageModelId: "nano-banana-2",
        imageGenerationRequestId: "request-1",
        status: "running",
      },
    });
    const generated = imageNode({
      width: 384,
      height: 216,
      metadata: {
        imageUrl: "https://media.otato.art/generated.png",
        previewImageUrl: "https://media.otato.art/generated.png",
        imageGenerationRequestId: "request-1",
        status: "success",
        lastRunAt: "2026-08-06T01:00:00.000Z",
        naturalWidth: 1920,
        naturalHeight: 1080,
      },
    });

    const nodes = mergeCanvasImageGenerationResult(board(current), current.id, "request-1", generated);

    expect(nodes?.[0]).toMatchObject({
      title: "用户改过的标题",
      position: { x: 80, y: 90 },
      width: 384,
      height: 216,
      metadata: {
        prompt: "用户后来修改的提示词",
        imageModelId: "nano-banana-2",
        imageUrl: "https://media.otato.art/generated.png",
        status: "success",
        naturalWidth: 1920,
        naturalHeight: 1080,
      },
    });
  });

  it("does not let an older request overwrite a newer generation", () => {
    const current = imageNode({
      metadata: {
        imageGenerationRequestId: "request-2",
        status: "running",
      },
    });
    const generated = imageNode({
      metadata: {
        imageUrl: "https://media.otato.art/old.png",
        imageGenerationRequestId: "request-1",
        status: "success",
      },
    });

    expect(mergeCanvasImageGenerationResult(board(current), current.id, "request-1", generated)).toBeNull();
  });
});
