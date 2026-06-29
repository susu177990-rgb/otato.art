import type { SupabaseClient } from "@supabase/supabase-js";
import { GENERATED_IMAGES_BUCKET } from "@/lib/generated-image-storage";
import { MODE_COVER_OUTPUT_MIME } from "@/lib/image/process-mode-cover";
import { deleteMediaObjects, mediaObjectKeyFromPublicUrl, putMediaObject } from "@/lib/media-storage";

export const MODE_COVER_STORAGE_PREFIX = "site/mode-covers";

export function sanitizeModeCoverModeId(modeId: string): string {
  return modeId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

type ModeCoverUploadOptions = {
  contentType?: string;
  extension?: string;
};

function sanitizeModeCoverExtension(extension: string): string {
  return extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "webp";
}

export function modeCoverStoragePath(modeId: string, extension = "webp"): string {
  const nonce = Math.random().toString(36).slice(2, 7);
  return `${MODE_COVER_STORAGE_PREFIX}/${sanitizeModeCoverModeId(modeId)}_${nonce}.${sanitizeModeCoverExtension(extension)}`;
}

export function storagePathFromPublicUrl(url: string, bucket = GENERATED_IMAGES_BUCKET): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const r2Key = mediaObjectKeyFromPublicUrl(trimmed);
  if (r2Key) return r2Key;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  let pathAndQuery = trimmed.slice(idx + marker.length);
  const qMark = pathAndQuery.indexOf('?');
  if (qMark !== -1) {
    pathAndQuery = pathAndQuery.slice(0, qMark);
  }
  const hashMark = pathAndQuery.indexOf('#');
  if (hashMark !== -1) {
    pathAndQuery = pathAndQuery.slice(0, hashMark);
  }
  return decodeURIComponent(pathAndQuery);
}

export function isStoredModeCoverUrl(url: string): boolean {
  const path = storagePathFromPublicUrl(url);
  return Boolean(path?.startsWith(`${MODE_COVER_STORAGE_PREFIX}/`));
}

export async function deleteModeCoverObject(
  supabase: SupabaseClient,
  coverUrl: string | undefined,
): Promise<void> {
  const path = coverUrl ? storagePathFromPublicUrl(coverUrl) : null;
  if (!path?.startsWith(`${MODE_COVER_STORAGE_PREFIX}/`)) return;
  if (coverUrl && mediaObjectKeyFromPublicUrl(coverUrl)) {
    await deleteMediaObjects([path]);
  }
}

export async function uploadModeCoverObject(
  supabase: SupabaseClient,
  modeId: string,
  imageBytes: Uint8Array,
  previousUrl?: string,
  options: ModeCoverUploadOptions = {},
): Promise<string> {
  if (!imageBytes.byteLength) throw new Error("封面图为空");

  if (previousUrl) {
    await deleteModeCoverObject(supabase, previousUrl);
  }

  const path = modeCoverStoragePath(modeId, options.extension);
  return putMediaObject({
    key: path,
    bytes: imageBytes,
    contentType: options.contentType ?? MODE_COVER_OUTPUT_MIME,
  });
}
