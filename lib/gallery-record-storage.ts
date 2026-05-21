import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { isStoredGeneratedImageUrl } from "@/lib/db/persist-generated-image";

/** 写入 Supabase JSONB 前：去掉参考图内联；去掉未上传的 data: / 超长 URL（像素应在 Storage） */
export function sanitizeGalleryRecordForStorage(record: ImageGalleryRecord): ImageGalleryRecord {
  const next: ImageGalleryRecord = { ...record, referenceImages: undefined };
  const url = next.imageUrl?.trim();
  if (!url) {
    delete next.imageUrl;
    return next;
  }
  if (isStoredGeneratedImageUrl(url)) return next;
  if (url.startsWith("data:") || url.length > 8192) {
    delete next.imageUrl;
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
