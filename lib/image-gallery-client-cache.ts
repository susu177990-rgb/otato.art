import type { ImageGalleryRecord } from "@/lib/image-workspace";

export const IMAGE_RESULT_CACHE_STORAGE_KEY = "script-agent-image-result-cache-v1";

const MAX_CACHED_RESULTS = 80;

export function readImageResultCache(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMAGE_RESULT_CACHE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveImageResultForRecord(recordId: string, imageUrl: string) {
  if (typeof window === "undefined" || !imageUrl.trim()) return;
  try {
    const cache = readImageResultCache();
    cache[recordId] = imageUrl;
    const entries = Object.entries(cache).slice(-MAX_CACHED_RESULTS);
    window.localStorage.setItem(IMAGE_RESULT_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 配额满时跳过本地缓存，不影响登录与其它功能
  }
}

export function mergeCachedImageUrls(records: ImageGalleryRecord[]): ImageGalleryRecord[] {
  const cache = readImageResultCache();
  return records.map((record) => {
    if (record.imageUrl?.trim()) return record;
    const cached = cache[record.id];
    return cached ? { ...record, imageUrl: cached } : record;
  });
}
