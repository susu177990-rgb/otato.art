import assert from "node:assert/strict";
import { normalizeBoardData } from "@/lib/canvas/board-store";

const legacy = normalizeBoardData({
  nodes: [
    {
      id: "text-legacy",
      type: "text",
      title: "旧文本",
      position: { x: 1, y: 2 },
      width: 240,
      height: 160,
      metadata: { text: "# 旧内容" },
    },
  ],
  connections: [],
  viewport: { x: 0, y: 0, k: 1 },
});

assert.equal(legacy.nodes[0]?.metadata?.textMode, "manual");
assert.equal(legacy.nodes[0]?.metadata?.text, "# 旧内容");
assert.equal(legacy.nodes[0]?.metadata?.chatPreferredImageModelId, undefined);

const chat = normalizeBoardData({
  nodes: [
    {
      id: "text-chat",
      type: "text",
      title: "对话文本",
      position: { x: 1, y: 2 },
      width: 440,
      height: 420,
      metadata: {
        textMode: "chat",
        chatConversationId: "conv-1",
        chatInput: "继续",
        chatStatus: "success",
        chatPreviewMarkdown: "## 回复",
        text: "## 回复",
      },
    },
  ],
  connections: [],
  viewport: { x: 0, y: 0, k: 1 },
});

assert.equal(chat.nodes[0]?.metadata?.textMode, "chat");
assert.equal(chat.nodes[0]?.metadata?.chatConversationId, "conv-1");
assert.equal(chat.nodes[0]?.metadata?.chatInput, "继续");
assert.equal(chat.nodes[0]?.metadata?.chatStatus, "success");
assert.equal(chat.nodes[0]?.metadata?.chatPreviewMarkdown, "## 回复");
assert.equal(chat.nodes[0]?.metadata?.text, "## 回复");

const legacyChooser = normalizeBoardData({
  nodes: [
    {
      id: "text-chooser",
      type: "text",
      title: "新文本",
      position: { x: 0, y: 0 },
      width: 440,
      height: 420,
      metadata: {
        textMode: "chooser",
        chatPreferredLlmModelId: "legacy-default",
        chatPreferredImageModelId: "gpt-image-2",
        chatLastAssistantMessageId: "msg-a",
      },
    },
  ],
  connections: [],
  viewport: { x: 0, y: 0, k: 1 },
});

assert.equal(legacyChooser.nodes[0]?.metadata?.textMode, "chat");
assert.equal(legacyChooser.nodes[0]?.metadata?.chatPreferredLlmModelId, "legacy-default");
assert.equal(legacyChooser.nodes[0]?.metadata?.chatPreferredImageModelId, "gpt-image-2");
assert.equal(legacyChooser.nodes[0]?.metadata?.chatLastAssistantMessageId, "msg-a");

console.log("canvas board store smoke: ok");
