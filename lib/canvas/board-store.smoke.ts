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

const presetTest = normalizeBoardData({
  nodes: [
    {
      id: "preset-node-1",
      type: "preset",
      title: "写实风格",
      position: { x: 100, y: 150 },
      width: 320,
      height: 214,
      metadata: {
        presetId: "preset-a",
        presetKind: "image",
        presetDescription: "生图预设描述",
        prompt: "A photorealistic cat",
        previewImageUrl: "https://example.com/cover.jpg",
        presetCoverNaturalWidth: 1200,
        presetCoverNaturalHeight: 800,
      },
    },
  ],
  connections: [],
  viewport: { x: 0, y: 0, k: 1 },
});

assert.equal(presetTest.nodes[0]?.type, "text");
assert.equal(presetTest.nodes[0]?.title, "写实风格");
assert.equal(presetTest.nodes[0]?.width, 320);
assert.equal(presetTest.nodes[0]?.height, 214);
assert.equal(presetTest.nodes[0]?.metadata?.textMode, "manual");
assert.equal(presetTest.nodes[0]?.metadata?.text, "A photorealistic cat");
assert.equal(presetTest.nodes[0]?.metadata?.presetId, "preset-a");
assert.equal(presetTest.nodes[0]?.metadata?.presetKind, "image");
assert.equal(presetTest.nodes[0]?.metadata?.presetDescription, "生图预设描述");
assert.equal(presetTest.nodes[0]?.metadata?.prompt, "A photorealistic cat");
assert.equal(presetTest.nodes[0]?.metadata?.previewImageUrl, "https://example.com/cover.jpg");
assert.equal(presetTest.nodes[0]?.metadata?.presetCoverNaturalWidth, 1200);
assert.equal(presetTest.nodes[0]?.metadata?.presetCoverNaturalHeight, 800);

console.log("canvas board store smoke: ok");
