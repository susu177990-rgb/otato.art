import type { ImageGalleryRecord } from "@/lib/image-workspace";

/** 写入 Supabase 前剥离会撑爆 JSONB 的内联字段 */
export function sanitizeGalleryRecordForStorage(record: ImageGalleryRecord): ImageGalleryRecord {
  const next: ImageGalleryRecord = { ...record, referenceImages: undefined };
  const url = next.imageUrl?.trim();
  if (!url) {
    delete next.imageUrl;
    return next;
  }
  if (url.startsWith("data:") || url.length > 8192) {
    delete next.imageUrl;
  }
  return next;
}

export function isPersistableRemoteImageUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  const t = url.trim();
  if (t.startsWith("data:")) return false;
  if (t.length > 8192) return false;
  return /^https?:\/\//i.test(t);
}
