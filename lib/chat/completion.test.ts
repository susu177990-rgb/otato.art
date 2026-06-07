import { describe, it, expect } from "vitest";
import { parseAssistantChoice, messageToOpenAiMessage, validateMessagesForSend } from "./completion";
import type { ChatMessage } from "./types";

describe("parseAssistantChoice", () => {
  it("null when no choices", () => {
    const r = parseAssistantChoice({});
    expect(r.contentText).toBeNull();
    expect(r.toolCalls).toEqual([]);
  });

  it("null when empty choices", () => {
    const r = parseAssistantChoice({ choices: [{}] });
    expect(r.contentText).toBeNull();
    expect(r.toolCalls).toEqual([]);
  });

  it("extracts text", () => {
    const r = parseAssistantChoice({ choices: [{ message: { content: "hi" } }] });
    expect(r.contentText).toBe("hi");
  });

  it("extracts from array content", () => {
    const r = parseAssistantChoice({
      choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } }],
    });
    expect(r.contentText).toBe("A\nB");
  });

  it("falls back to reasoning_content", () => {
    const r = parseAssistantChoice({
      choices: [{ message: { content: null, reasoning_content: "think" } }],
    });
    expect(r.contentText).toBe("think");
  });

  it("prefers content over reasoning", () => {
    const r = parseAssistantChoice({
      choices: [{ message: { content: "yes", reasoning_content: "no" } }],
    });
    expect(r.contentText).toBe("yes");
  });

  it("parses tool calls", () => {
    const r = parseAssistantChoice({
      choices: [{
        message: {
          tool_calls: [{ id: "c1", type: "function", function: { name: "gen", arguments: "{}" } }],
        },
      }],
    });
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe("gen");
  });

  it("skips tool calls with empty name", () => {
    const r = parseAssistantChoice({
      choices: [{ message: { tool_calls: [{ id: "x", type: "function", function: {} }] } }],
    });
    expect(r.toolCalls).toHaveLength(0);
  });

  it("falls back to generated id", () => {
    const r = parseAssistantChoice({
      choices: [{ message: { tool_calls: [{ id: "", type: "function", function: { name: "t", arguments: "{}" } }] } }],
    });
    expect(r.toolCalls[0].id).toMatch(/^call-/);
  });
});

describe("messageToOpenAiMessage", () => {
  const user = (t: string): ChatMessage => ({ id: "u", role: "user", createdAt: 1, parts: [{ type: "text", text: t }] });
  const sys = (t: string): ChatMessage => ({ id: "s", role: "system", createdAt: 1, parts: [{ type: "text", text: t }] });
  const tool = (t: string): ChatMessage => ({ id: "t", role: "tool", createdAt: 1, parts: [{ type: "text", text: t }], toolCallId: "tc" });

  it("system", () => expect(messageToOpenAiMessage(sys("a"))).toEqual({ role: "system", content: "a" }));
  it("empty system to space", () => {
    const m: ChatMessage = { id: "s", role: "system", createdAt: 1, parts: [] };
    expect(messageToOpenAiMessage(m)).toEqual({ role: "system", content: " " });
  });
  it("user string", () => expect(messageToOpenAiMessage(user("hi"))).toEqual({ role: "user", content: "hi" }));
  it("user with attachment", () => {
    const m: ChatMessage = {
      id: "u", role: "user", createdAt: 1,
      parts: [
        { type: "text", text: "img" },
        { type: "attachment", attachment: { kind: "image", mime: "image/png", name: "x.png", dataUrl: "data:image/png;base64,A" } },
      ],
    };
    const r = messageToOpenAiMessage(m);
    expect(Array.isArray(r.content)).toBe(true);
    expect((r.content as unknown[])[0]).toMatchObject({ type: "text" });
    expect((r.content as unknown[])[1]).toMatchObject({ type: "image_url" });
  });
  it("tool", () => expect(messageToOpenAiMessage(tool("{}"))).toEqual({ role: "tool", tool_call_id: "tc", content: "{}" }));
  it("assistant with tool calls", () => {
    const m: ChatMessage = {
      id: "a", role: "assistant", createdAt: 1,
      parts: [{ type: "text", text: "ok" }],
      toolCalls: [{ id: "t1", name: "fn", arguments: "{}" }],
    };
    const r = messageToOpenAiMessage(m);
    expect(r.content).toBe("ok");
    expect((r.tool_calls as unknown[])).toHaveLength(1);
  });
  it("assistant tool calls with empty parts => null content", () => {
    const m: ChatMessage = {
      id: "a", role: "assistant", createdAt: 1, parts: [],
      toolCalls: [{ id: "t1", name: "fn", arguments: "{}" }],
    };
    expect(messageToOpenAiMessage(m).content).toBeNull();
  });
});

describe("validateMessagesForSend", () => {
  it("throws empty", () => expect(() => validateMessagesForSend([])).toThrow("对话消息为空"));
  it("passes valid", () => {
    const m: ChatMessage = { id: "u", role: "user", createdAt: 1, parts: [{ type: "text", text: "hi" }] };
    expect(() => validateMessagesForSend([m])).not.toThrow();
  });
  it("throws oversized attachment", () => {
    const m: ChatMessage = {
      id: "u", role: "user", createdAt: 1,
      parts: [{
        type: "attachment",
        attachment: { kind: "image", mime: "image/png", name: "b.png", dataUrl: `data:image/png;base64,${"A".repeat(18_000_000)}` },
      }],
    };
    expect(() => validateMessagesForSend([m])).toThrow("过大");
  });
});