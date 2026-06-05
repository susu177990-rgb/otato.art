import type { SupabaseClient } from "@supabase/supabase-js";
import { GENERATED_IMAGES_BUCKET } from "@/lib/db/persist-generated-image";
import { MODE_COVER_OUTPUT_MIME } from "@/lib/image/process-mode-cover";

export const MODE_COVER_STORAGE_PREFIX = "site/mode-covers";

export function sanitizeModeCoverModeId(modeId: string): string {
  return modeId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

export function modeCoverStoragePath(modeId: string): string {
  const nonce = Math.random().toString(36).slice(2, 7);
  return `${MODE_COVER_STORAGE_PREFIX}/${sanitizeModeCoverModeId(modeId)}_${nonce}.webp`;
}

export function storagePathFromPublicUrl(url: string, bucket = GENERATED_IMAGES_BUCKET): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
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
  const { error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).remove([path]);
  if (error) throw new Error(`删除封面图失败: ${error.message}`);
}

export async function uploadModeCoverObject(
  supabase: SupabaseClient,
  modeId: string,
  webpBytes: Uint8Array,
  previousUrl?: string,
): Promise<string> {
  if (!webpBytes.byteLength) throw new Error("封面图为空");

  if (previousUrl) {
    await deleteModeCoverObject(supabase, previousUrl);
  }

  const path = modeCoverStoragePath(modeId);
  const { error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).upload(path, webpBytes, {
    contentType: MODE_COVER_OUTPUT_MIME,
    upsert: true,
  });
  if (error) throw new Error(`上传封面图失败: ${error.message}`);

  const { data } = supabase.storage.from(GENERATED_IMAGES_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("无法生成封面图公开地址");
  return data.publicUrl;
}
