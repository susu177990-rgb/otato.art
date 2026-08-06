import { describe, expect, it } from "vitest";
import type { ChatMessage, ConversationAttachmentEntry } from "@/lib/chat/types";
import { compactChatMessagesForStorage, hydrateChatMessagesFromAttachments } from "./chat-store";

describe("chat attachment storage", () => {
  it("stores registered binary only once and hydrates it for display", () => {
    const dataUrl = "data:image/png;base64,AAAA";
    const messages: ChatMessage[] = [{
      id: "u1",
      role: "user",
      createdAt: 1,
      parts: [{
        type: "attachment",
        attachment: {
          kind: "image",
          mime: "image/png",
          name: "ref.png",
          registryId: "att-1",
          dataUrl,
        },
      }],
    }];
    const attachments: ConversationAttachmentEntry[] = [{
      id: "att-1",
      messageId: "u1",
      name: "ref.png",
      mime: "image/png",
      kind: "image",
      createdAt: 1,
      dataUrl,
    }];

    const compacted = compactChatMessagesForStorage(messages);
    expect(JSON.stringify(compacted)).not.toContain(dataUrl);
    expect(JSON.stringify(attachments)).toContain(dataUrl);
    expect(hydrateChatMessagesFromAttachments(compacted, attachments)).toEqual(messages);
  });
});
