import type { ImageGalleryRecord } from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import type { ProjectAsset, ProjectGalleryItem } from "./types";

function recordTitle(text: string | undefined, fallback: string): string {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return Array.from(cleaned).slice(0, 24).join("");
}

export function buildProjectGalleryItems(input: {
  assets: ProjectAsset[];
  images: ImageGalleryRecord[];
  videos: VideoGalleryRecord[];
}): ProjectGalleryItem[] {
  const images: ProjectGalleryItem[] = input.images
    .filter((record) => record.status === "success" && Boolean(record.imageUrl?.trim()))
    .map((record) => ({
      id: `image:${record.id}`,
      kind: "image",
      createdAt: record.createdAt,
      name: recordTitle(record.userInput || record.finalPrompt, "生成图片"),
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
      name: recordTitle(record.finalPrompt, "生成视频"),
      description: record.finalPrompt,
      mediaUrl: record.videoUrl!,
      sourceRecordId: record.id,
    }));

  return [...images, ...videos].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
}
