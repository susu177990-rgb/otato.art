import { describe, expect, it } from "vitest";
import { compactAllAttachmentsForTextOnlyApi, compactMessagesForAgentApi } from "./attachments";
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
});
