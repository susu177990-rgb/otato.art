import { describe, expect, it } from "vitest";
import {
  CHAT_HISTORY_MAX_MESSAGES,
  compactAllAttachmentsForTextOnlyApi,
  compactMessagesForAgentApi,
  prepareConversationHistoryForLlm,
} from "./attachments";
import type { ChatMessage } from "./types";

describe("compactAllAttachmentsForTextOnlyApi", () => {
  it("converts latest image attachments to text descriptors for text-only LLM calls", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        createdAt: 1,
        parts: [
          { type: "text", text: "分析一下" },
          {
            type: "attachment",
            attachment: {
              kind: "image",
              mime: "image/png",
              name: "ref.png",
              dataUrl: "data:image/png;base64,AAAA",
              registryId: "att-1",
            },
          },
        ],
      },
    ];

    const compacted = compactAllAttachmentsForTextOnlyApi(messages);

    expect(compacted[0].parts).toHaveLength(2);
    expect(compacted[0].parts[1]).toMatchObject({
      type: "text",
      text: expect.stringContaining('attachment_id="att-1"'),
    });
    expect(JSON.stringify(compacted)).not.toContain("data:image");
    expect(compacted[0].parts.some((part) => part.type === "attachment")).toBe(false);
  });

  it("leaves system and tool messages unchanged", () => {
    const messages: ChatMessage[] = [
      { id: "s", role: "system", createdAt: 1, parts: [{ type: "text", text: "sys" }] },
      { id: "t", role: "tool", createdAt: 2, parts: [{ type: "text", text: "{}" }], toolCallId: "tc" },
    ];

    expect(compactAllAttachmentsForTextOnlyApi(messages)).toEqual(messages);
  });
});

describe("compactMessagesForAgentApi", () => {
  it("keeps the latest user attachments and compacts older attachment messages", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        createdAt: 1,
        parts: [
          {
            type: "attachment",
            attachment: {
              kind: "image",
              mime: "image/png",
              name: "old.png",
              dataUrl: "data:image/png;base64,OLD",
              registryId: "att-old",
            },
          },
        ],
      },
      {
        id: "u2",
        role: "user",
        createdAt: 2,
        parts: [
          { type: "text", text: "继续看这张图" },
          {
            type: "attachment",
            attachment: {
              kind: "image",
              mime: "image/png",
              name: "latest.png",
              dataUrl: "data:image/png;base64,LATEST",
              registryId: "att-latest",
            },
          },
        ],
      },
    ];

    const compacted = compactMessagesForAgentApi(messages);

    expect(compacted[0].parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('attachment_id="att-old"'),
    });
    expect(compacted[1].parts[1]).toMatchObject({ type: "attachment" });
    expect(JSON.stringify(compacted[1])).toContain("data:image/png;base64,LATEST");
  });

  it("also strips legacy historical attachments without registry ids", () => {
    const messages: ChatMessage[] = [
      {
        id: "legacy",
        role: "user",
        createdAt: 1,
        parts: [{
          type: "attachment",
          attachment: { kind: "image", mime: "image/png", name: "legacy.png", dataUrl: "data:image/png;base64,OLD" },
        }],
      },
      { id: "latest", role: "user", createdAt: 2, parts: [{ type: "text", text: "继续" }] },
    ];

    const compacted = compactMessagesForAgentApi(messages);
    expect(JSON.stringify(compacted)).not.toContain("data:image");
    expect(compacted[0].parts[0].type).toBe("text");
  });
});

describe("prepareConversationHistoryForLlm", () => {
  it("turns persisted local tool output into valid assistant context", () => {
    const messages: ChatMessage[] = [{
      id: "tool-1",
      role: "tool",
      createdAt: 1,
      toolCallId: "local-image",
      parts: [{ type: "text", text: '{"success":true,"media_url":"https://example.com/a.png"}' }],
    }];

    const prepared = prepareConversationHistoryForLlm(messages);
    expect(prepared[0].role).toBe("assistant");
    expect(prepared[0].toolCallId).toBeUndefined();
    expect(JSON.stringify(prepared[0])).toContain("先前的系统工具结果");
  });

  it("keeps only a bounded recent history", () => {
    const messages: ChatMessage[] = Array.from({ length: CHAT_HISTORY_MAX_MESSAGES + 5 }, (_, index) => ({
      id: `m-${index}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      createdAt: index,
      parts: [{ type: "text" as const, text: `message-${index}` }],
    }));

    const prepared = prepareConversationHistoryForLlm(messages);
    expect(prepared).toHaveLength(CHAT_HISTORY_MAX_MESSAGES);
    expect(prepared[0].id).toBe("m-5");
    expect(prepared.at(-1)?.id).toBe(`m-${CHAT_HISTORY_MAX_MESSAGES + 4}`);
  });
});
