import assert from "node:assert/strict";
import {
  parseAssetMentions,
  resolveAssetMentions,
  type AssetMentionCandidate,
} from "./asset-mentions";
import { resolveMentions } from "./prompt-mention";

const slotCandidates: AssetMentionCandidate[] = [
  { id: "0", label: "图1", type: "slot", role: "image_reference", url: "data:image/png;base64,a" },
  { id: "1", label: "图2", type: "slot", role: "image_reference", url: "data:image/png;base64,b" },
  { id: "vid", label: "动作视频", type: "node", nodeType: "video", role: "video_reference", url: "https://example.com/a.mp4" },
];

const legacy = parseAssetMentions("用 @[图1](slot:0) 作为主体，参考 @[文本A](node:text-1)");
assert.equal(legacy.length, 2);
assert.equal(legacy[0].type, "slot");
assert.equal(legacy[0].id, "0");
assert.equal(legacy[1].type, "node");

const strong = resolveAssetMentions("只参考 @[图2](slot:1?role=image_reference)", slotCandidates);
assert.equal(strong.prompt, "只参考 图2");
assert.equal(strong.hasMentions, true);
assert.equal(strong.mentions[0].candidate?.id, "1");

const legacySlot = resolveAssetMentions("只参考 @[图1](slot:0)", slotCandidates);
assert.equal(legacySlot.missingMentions.length, 0);
assert.equal(legacySlot.mentions[0].candidate?.id, "0");
assert.equal(legacySlot.mentions[0].candidate?.role, "image_reference");

const missing = resolveAssetMentions("引用 @[坏图](slot:9?role=image_reference)", slotCandidates);
assert.equal(missing.missingMentions.length, 1);

const role = resolveAssetMentions("用 @[动作视频](node:vid?role=video_reference)", slotCandidates);
assert.equal(role.mentions[0].candidate?.role, "video_reference");

const canvasResolved = resolveMentions("镜头：@[分镜文本](node:text-1?role=prompt)，参考 @[上传图](node:image-1?role=image_reference)", {
  canvasNodes: [
    { id: "text-1", type: "text", title: "分镜文本", metadata: { text: "女孩走进霓虹雨夜" } },
    { id: "image-1", type: "image", title: "上传图", metadata: { imageUrl: "https://example.com/ref.png" } },
  ],
});
assert.equal(canvasResolved.cleanedPrompt, "镜头：女孩走进霓虹雨夜，参考 上传图");
assert.deepEqual(canvasResolved.resolvedNodeIds, ["text-1"]);
assert.equal(canvasResolved.mentionedReferences[0].url, "https://example.com/ref.png");

console.log("asset mention smoke passed");
