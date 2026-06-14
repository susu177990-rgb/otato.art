import { describe, expect, it } from "vitest";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { buildProjectGalleryItems } from "./gallery";
import type { ProjectAsset } from "./types";

const asset: ProjectAsset = {
  id: "asset-1",
  projectId: "project-1",
  type: "prop",
  name: "怀表",
  description: "黄铜怀表",
  tags: ["黄铜"],
  primaryImageUrl: "https://example.com/watch.png",
  referenceImageUrls: [],
  createdAt: "2026-06-14T01:00:00.000Z",
  updatedAt: "2026-06-14T01:00:00.000Z",
};

const image = {
  id: "image-1",
  createdAt: "2026-06-14T03:00:00.000Z",
  modeId: "free",
  modeName: "自由模式",
  modelId: "gpt-image-2",
  modelName: "GPT Image",
  finalPrompt: "雨夜",
  userInput: "雨夜",
  aspectRatio: "1:1",
  imageSize: "1K",
  imageUrl: "https://example.com/rain.png",
  thumbnailUrl: "https://example.com/rain-thumb.png",
  refImageCount: 0,
  status: "success",
} satisfies ImageGalleryRecord;

const video = {
  id: "video-1",
  createdAt: "2026-06-14T02:00:00.000Z",
  modelId: "seedance-1.5",
  modelName: "Seedance",
  modeId: "text_to_video",
  modeName: "文生视频",
  finalPrompt: "列车驶入",
  durationSeconds: 5,
  videoUrl: "https://example.com/train.mp4",
  status: "success",
} as VideoGalleryRecord;

describe("project gallery aggregation", () => {
  it("merges assets, successful images, and successful videos by newest first", () => {
    const items = buildProjectGalleryItems({
      assets: [asset],
      images: [image, { ...image, id: "failed", status: "error", imageUrl: undefined }],
      videos: [video],
    });

    expect(items.map((item) => item.id)).toEqual([
      "image:image-1",
      "video:video-1",
      "project-asset:asset-1",
    ]);
  });

  it("preserves the source gallery record id for non-destructive conversion", () => {
    const [item] = buildProjectGalleryItems({ assets: [], images: [image], videos: [] });
    expect(item).toMatchObject({
      kind: "image",
      sourceRecordId: "image-1",
      mediaUrl: "https://example.com/rain.png",
    });
  });
});
