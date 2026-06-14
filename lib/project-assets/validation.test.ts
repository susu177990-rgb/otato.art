import { describe, expect, it } from "vitest";
import {
  PROJECT_ASSET_IMAGE_MAX_BYTES,
  PROJECT_ASSET_REFERENCE_LIMIT,
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
        referenceImageUrls: [
          "https://example.com/ref-1.png",
          "https://example.com/ref-1.png",
        ],
      }),
    ).toEqual({
      type: "character",
      name: "女主角",
      description: "红发机械师",
      tags: ["主角", "机械"],
      primaryImageUrl: "https://example.com/main.png",
      referenceImageUrls: ["https://example.com/ref-1.png"],
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

  it("rejects more than eight reference images", () => {
    expect(() =>
      parseProjectAssetInput({
        type: "scene",
        name: "车站",
        primaryImageUrl: "https://example.com/main.png",
        referenceImageUrls: Array.from(
          { length: PROJECT_ASSET_REFERENCE_LIMIT + 1 },
          (_, index) => `https://example.com/ref-${index}.png`,
        ),
      }),
    ).toThrow("参考图最多 8 张");
  });

  it("accepts image data urls and rejects oversized uploads", () => {
    const dataUrl = "data:image/png;base64,AAAA";
    expect(
      parseProjectAssetInput({
        type: "prop",
        name: "怀表",
        primaryImageUrl: dataUrl,
      }).primaryImageUrl,
    ).toBe(dataUrl);

    const tooLarge = `data:image/png;base64,${"A".repeat(Math.ceil((PROJECT_ASSET_IMAGE_MAX_BYTES + 1) / 3) * 4)}`;
    expect(() =>
      parseProjectAssetInput({
        type: "prop",
        name: "过大图片",
        primaryImageUrl: tooLarge,
      }),
    ).toThrow("主图不能超过 20MB");
  });

  it("requires at least one field in a patch", () => {
    expect(() => parseProjectAssetPatch({})).toThrow("没有可更新的素材字段");
  });
});
