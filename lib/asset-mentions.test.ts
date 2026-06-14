import { describe, expect, it } from "vitest";
import {
  parseAssetMentions,
  resolveAssetMentions,
  serializeAssetMention,
  type AssetMentionCandidate,
} from "./asset-mentions";
import { resolveMentions } from "./prompt-mention";

const projectAsset: AssetMentionCandidate = {
  id: "asset-1",
  label: "女主角",
  type: "project-asset",
  role: "image_reference",
  groupLabel: "角色",
  description: "红发机械师",
  url: "https://example.com/hero.png",
  referenceUrls: [
    "https://example.com/hero-side.png",
    "https://example.com/hero-back.png",
  ],
  thumbnailUrl: "https://example.com/hero-thumb.png",
  nodeType: "image",
};

describe("project asset mentions", () => {
  it("serializes and parses a stable project-asset target", () => {
    const serialized = serializeAssetMention(projectAsset);
    expect(serialized).toBe("@[女主角](project-asset:asset-1?role=image_reference)");
    expect(parseAssetMentions(serialized)).toMatchObject([
      {
        label: "女主角",
        type: "project-asset",
        id: "asset-1",
        role: "image_reference",
      },
    ]);
  });

  it("keeps missing project assets explicit", () => {
    const resolution = resolveAssetMentions(
      "@[已删除素材](project-asset:missing?role=image_reference)",
      [projectAsset],
    );
    expect(resolution.missingMentions).toHaveLength(1);
    expect(resolution.prompt).toBe("已删除素材");
  });

  it("resolves a project asset into a generation image reference", () => {
    const resolution = resolveMentions(
      "保持 @[女主角](project-asset:asset-1?role=image_reference) 的造型",
      { candidates: [projectAsset] },
    );
    expect(resolution.cleanedPrompt).toBe("保持 女主角 的造型");
    expect(resolution.mentionedReferences).toEqual([
      {
        id: "asset-1",
        type: "image",
        url: "https://example.com/hero.png",
        label: "女主角",
        role: "image_reference",
      },
      {
        id: "asset-1:reference:1",
        type: "image",
        url: "https://example.com/hero-side.png",
        label: "女主角 参考图 1",
        role: "image_reference",
      },
      {
        id: "asset-1:reference:2",
        type: "image",
        url: "https://example.com/hero-back.png",
        label: "女主角 参考图 2",
        role: "image_reference",
      },
    ]);
  });
});
