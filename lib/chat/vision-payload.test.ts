import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { ChatMessage } from "./types";
import { prepareMessagesForLlmVision } from "./vision-payload";

describe("prepareMessagesForLlmVision", () => {
  it("creates a smaller JPEG derivative without changing the stored message", async () => {
    const png = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: "#c0392b" },
    }).png().toBuffer();
    const originalDataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const messages: ChatMessage[] = [{
      id: "u1",
      role: "user",
      createdAt: 1,
      parts: [{
        type: "attachment",
        attachment: { kind: "image", mime: "image/png", name: "large.png", dataUrl: originalDataUrl },
      }],
    }];

    const prepared = await prepareMessagesForLlmVision(messages);
    const part = prepared[0].parts[0];
    expect(part.type).toBe("attachment");
    if (part.type !== "attachment") throw new Error("expected attachment");
    expect(part.attachment.mime).toBe("image/jpeg");
    expect(part.attachment.dataUrl).not.toBe(originalDataUrl);
    expect(messages[0].parts[0]).toMatchObject({ attachment: { dataUrl: originalDataUrl } });

    const optimized = Buffer.from(part.attachment.dataUrl.split(",")[1], "base64");
    const metadata = await sharp(optimized).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
  });

  it("does not send video binary to a normal LLM request", async () => {
    const messages: ChatMessage[] = [{
      id: "u1",
      role: "user",
      createdAt: 1,
      parts: [{
        type: "attachment",
        attachment: { kind: "video", mime: "video/mp4", name: "clip.mp4", dataUrl: "data:video/mp4;base64,AAAA" },
      }],
    }];

    const prepared = await prepareMessagesForLlmVision(messages);
    expect(prepared[0].parts[0]).toMatchObject({ type: "text", text: expect.stringContaining("未附带视频二进制") });
    expect(JSON.stringify(prepared)).not.toContain("data:video");
  });
});
