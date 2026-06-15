import { describe, expect, it } from "vitest";
import {
  PROJECT_ASSET_IMAGE_MAX_BYTES,
  parseProjectAssetInput,
  parseProjectAssetPatch,
} from "./validation";

describe("project asset validation", () => {
  it("normalizes a complete project asset", () => {
    expect(
      parseProjectAssetInput({
        type: "character",
        name: "  女主角  ",
        description: "  红发机械师  ",
        tags: ["主角", "主角", "机械"],
        primaryImageUrl: "https://example.com/main.png",
        referenceImageUrls: [],
      }),
    ).toEqual({
      type: "character",
      name: "女主角",
      description: "红发机械师",
      tags: ["主角", "机械"],
      primaryImageUrl: "https://example.com/main.png",
      referenceImageUrls: [],
    });
  });

  it("rejects unsupported categories", () => {
    expect(() =>
      parseProjectAssetInput({
        type: "costume",
        name: "制服",
        primaryImageUrl: "https://example.com/main.png",
      }),
    ).toThrow("素材分类必须是 character、prop 或 scene");
  });

  it("accepts image and video media urls and rejects oversized uploads", () => {
    const dataUrl = "data:image/png;base64,AAAA";
    expect(
      parseProjectAssetInput({
        type: "prop",
        name: "怀表",
        primaryImageUrl: dataUrl,
      }).primaryImageUrl,
    ).toBe(dataUrl);

    const videoDataUrl = "data:video/mp4;base64,AAAA";
    expect(
      parseProjectAssetInput({
        type: "prop",
        name: "动作片段",
        primaryImageUrl: videoDataUrl,
      }).primaryImageUrl,
    ).toBe(videoDataUrl);

    const tooLarge = `data:image/png;base64,${"A".repeat(Math.ceil((PROJECT_ASSET_IMAGE_MAX_BYTES + 1) / 3) * 4)}`;
    expect(() =>
      parseProjectAssetInput({
        type: "prop",
        name: "过大图片",
        primaryImageUrl: tooLarge,
      }),
    ).toThrow("媒体文件不能超过 20MB");
  });

  it("requires at least one field in a patch", () => {
    expect(() => parseProjectAssetPatch({})).toThrow("没有可更新的素材字段");
  });
});
