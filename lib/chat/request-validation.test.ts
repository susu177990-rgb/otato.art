import { describe, expect, it } from "vitest";
import { CHAT_MAX_ATTACHMENTS_PER_TURN, parseChatUserMessage } from "./request-validation";

function imagePart(index: number) {
  return {
    type: "attachment" as const,
    attachment: {
      kind: "image" as const,
      mime: "image/png",
      name: `${index}.png`,
      registryId: `att-${index}`,
      dataUrl: "data:image/png;base64,AAAA",
    },
  };
}

describe("parseChatUserMessage", () => {
  it("accepts a user message and replaces the client timestamp", () => {
    const parsed = parseChatUserMessage({
      id: "u1",
      role: "user",
      createdAt: 1,
      parts: [{ type: "text", text: "hello" }],
    });
    expect(parsed.role).toBe("user");
    expect(parsed.createdAt).toBeGreaterThan(1);
  });

  it("rejects privileged roles, videos, duplicate ids, and aggregate overflow", () => {
    expect(() => parseChatUserMessage({ id: "a", role: "assistant", parts: [] })).toThrow("用户消息");
    expect(() => parseChatUserMessage({
      id: "u1",
      role: "user",
      parts: [{
        type: "attachment",
        attachment: { kind: "video", mime: "video/mp4", name: "x.mp4", registryId: "v1", dataUrl: "data:video/mp4;base64,AAAA" },
      }],
    })).toThrow("仅支持图片");
    expect(() => parseChatUserMessage({ id: "u1", role: "user", parts: [imagePart(1), imagePart(1)] })).toThrow("重复");
    expect(() => parseChatUserMessage({
      id: "u1",
      role: "user",
      parts: Array.from({ length: CHAT_MAX_ATTACHMENTS_PER_TURN + 1 }, (_, index) => imagePart(index)),
    })).toThrow("每轮最多上传");
  });
});
