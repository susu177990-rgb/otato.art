import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types";
import { detectImageGenerationIntent } from "./image-intent";

function userMessage(text: string, withImage = false): ChatMessage {
  return {
    id: "u1",
    role: "user",
    createdAt: 1,
    parts: [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...(withImage
        ? [
            {
              type: "attachment" as const,
              attachment: {
                kind: "image" as const,
                mime: "image/png",
                name: "image.png",
                dataUrl: "data:image/png;base64,A",
              },
            },
          ]
        : []),
    ],
  };
}

describe("detectImageGenerationIntent", () => {
  it("does not treat an image-only upload as a generation request", () => {
    const intent = detectImageGenerationIntent([userMessage("", true)]);

    expect(intent.active).toBe(false);
    expect(intent.hasReferenceImages).toBe(true);
    expect(intent.referenceOnly).toBe(true);
  });

  it("does not treat a short analysis request with an image as generation", () => {
    const intent = detectImageGenerationIntent([userMessage("分析一下", true)]);

    expect(intent.active).toBe(false);
    expect(intent.hasReferenceImages).toBe(true);
    expect(intent.referenceOnly).toBe(true);
  });

  it("treats explicit image-edit wording with an attachment as generation", () => {
    const intent = detectImageGenerationIntent([userMessage("根据这张图改成赛博朋克风格", true)]);

    expect(intent.active).toBe(true);
    expect(intent.hasReferenceImages).toBe(true);
    expect(intent.referenceOnly).toBe(false);
  });

  it("still detects explicit text-only image generation requests", () => {
    const intent = detectImageGenerationIntent([userMessage("帮我生成一张角色海报", false)]);

    expect(intent.active).toBe(true);
    expect(intent.hasReferenceImages).toBe(false);
  });

  it("detects poster generation requests that include a reference image", () => {
    const intent = detectImageGenerationIntent([userMessage("用这张参考做一张角色海报", true)]);

    expect(intent.active).toBe(true);
    expect(intent.hasReferenceImages).toBe(true);
  });
});
