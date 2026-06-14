import type { ImageGalleryRecord } from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import type { ProjectAsset, ProjectGalleryItem } from "./types";

export function buildProjectGalleryItems(input: {
  assets: ProjectAsset[];
  images: ImageGalleryRecord[];
  videos: VideoGalleryRecord[];
}): ProjectGalleryItem[] {
  const assets: ProjectGalleryItem[] = input.assets.map((asset) => ({
    id: `project-asset:${asset.id}`,
    kind: "project-asset",
    createdAt: asset.createdAt,
    name: asset.name,
    description: asset.description,
    mediaUrl: asset.primaryImageUrl,
    thumbnailUrl: asset.primaryImageUrl,
    assetType: asset.type,
    tags: asset.tags,
    sourceRecordId: asset.id,
  }));
  const images: ProjectGalleryItem[] = input.images
    .filter((record) => record.status === "success" && Boolean(record.imageUrl?.trim()))
    .map((record) => ({
      id: `image:${record.id}`,
      kind: "image",
      createdAt: record.createdAt,
      name: record.modeName || "生成图片",
      description: record.userInput || record.finalPrompt,
      mediaUrl: record.imageUrl!,
      thumbnailUrl: record.thumbnailUrl,
      sourceRecordId: record.id,
    }));
  const videos: ProjectGalleryItem[] = input.videos
    .filter((record) => record.status === "success" && Boolean(record.videoUrl?.trim()))
    .map((record) => ({
      id: `video:${record.id}`,
      kind: "video",
      createdAt: record.createdAt,
      name: record.modeName || "生成视频",
      description: record.finalPrompt,
      mediaUrl: record.videoUrl!,
      sourceRecordId: record.id,
    }));

  return [...assets, ...images, ...videos].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}
