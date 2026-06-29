import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { isStoredGeneratedImageUrl } from "@/lib/generated-image-storage";

function sanitizeReferenceImages(record: ImageGalleryRecord): ImageGalleryRecord["referenceImages"] {
  return record.referenceImages
    ?.map((image) => ({
      ...image,
      dataUrl: image.dataUrl.trim(),
    }))
    .filter((image) => /^https?:\/\//i.test(image.dataUrl) && image.dataUrl.length <= 8192);
}

/** 写入 Supabase JSONB 前：只保留稳定 URL，去掉未上传的 data: / 超长 URL。 */
export function sanitizeGalleryRecordForStorage(record: ImageGalleryRecord): ImageGalleryRecord {
  const next: ImageGalleryRecord = {
    ...record,
    referenceImages: sanitizeReferenceImages(record),
  };
  if (!next.referenceImages?.length) delete next.referenceImages;
  const url = next.imageUrl?.trim();
  if (!url) {
    delete next.imageUrl;
    return next;
  }
  if (isStoredGeneratedImageUrl(url)) return next;
  if (url.startsWith("data:") || url.length > 8192) {
    delete next.imageUrl;
  }
  const thumbnailUrl = next.thumbnailUrl?.trim();
  if (!thumbnailUrl) {
    delete next.thumbnailUrl;
  } else if (thumbnailUrl.startsWith("data:") || thumbnailUrl.length > 8192) {
    delete next.thumbnailUrl;
  }
  return next;
}

export function isPersistableRemoteImageUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  const t = url.trim();
  if (t.startsWith("data:")) return false;
  if (isStoredGeneratedImageUrl(t)) return true;
  if (t.length > 8192) return false;
  return /^https?:\/\//i.test(t);
}
