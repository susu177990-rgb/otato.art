import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { isStoredGeneratedVideoUrl } from "@/lib/db/persist-generated-video";

/** 写入 Supabase JSONB 前：去掉未上传的超长 URL（像素应在 Storage） */
export function sanitizeVideoGalleryRecordForStorage(record: VideoGalleryRecord): VideoGalleryRecord {
  const next: VideoGalleryRecord = { ...record };
  const url = next.videoUrl?.trim();
  if (!url) {
    delete next.videoUrl;
    return next;
  }
  if (isStoredGeneratedVideoUrl(url)) return next;
  if (url.length > 8192) {
    delete next.videoUrl;
  }
  return next;
}

