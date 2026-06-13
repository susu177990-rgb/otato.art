import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { sanitizeGalleryRecordForStorage } from "@/lib/gallery-record-storage";
import { persistGeneratedImageWithThumbnailToStorage } from "@/lib/db/persist-generated-image";
import { GENERATED_IMAGES_BUCKET, isStoredGeneratedImageUrl } from "@/lib/generated-image-storage";

const DEFAULT_GALLERY_RECORD_LIMIT = 24;
const GALLERY_RETENTION_DAYS = 7;

/** 剥离 DB 中不应持久化的内联图（与写入前 sanitize 一致） */
function withoutInlineGalleryPayload(record: ImageGalleryRecord): ImageGalleryRecord {
  return sanitizeGalleryRecordForStorage(record);
}

async function persistGalleryRecordImage(
  supabase: SupabaseClient,
  userId: string,
  record: ImageGalleryRecord,
): Promise<ImageGalleryRecord> {
  const url = record.imageUrl?.trim();
  if (!url) return record;
  if (isStoredGeneratedImageUrl(url) && record.thumbnailUrl && isStoredGeneratedImageUrl(record.thumbnailUrl)) {
    return record;
  }
  const stored = await persistGeneratedImageWithThumbnailToStorage(supabase, userId, url, record.id);
  return { ...record, ...stored };
}

function toGalleryRow(userId: string, record: ImageGalleryRecord) {
  return {
    id: record.id,
    user_id: userId,
    data: sanitizeGalleryRecordForStorage(record),
    created_at: record.createdAt,
  };
}

function storedGeneratedImagePath(url: string, userId: string): string | null {
  if (!isStoredGeneratedImageUrl(url)) return null;
  try {
    const marker = `/storage/v1/object/public/${GENERATED_IMAGES_BUCKET}/`;
    const path = decodeURIComponent(new URL(url).pathname.split(marker)[1] || "");
    if (!path.startsWith(`${userId}/`)) return null;
    return path;
  } catch {
    return null;
  }
}

function galleryRecordStoragePaths(
  rows: Array<{ data: ImageGalleryRecord }>,
  userId: string,
): string[] {
  return rows
    .flatMap((row) => [
      storedGeneratedImagePath(row.data?.imageUrl || "", userId),
      storedGeneratedImagePath(row.data?.thumbnailUrl || "", userId),
    ])
    .filter((path): path is string => Boolean(path));
}

async function removeGalleryStorageObjects(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const uniquePaths = Array.from(new Set(paths));
  const { error } = await supabase.storage.from(GENERATED_IMAGES_BUCKET).remove(uniquePaths);
  if (error) console.warn("[image/gallery storage cleanup]", error);
}

function postgrestTextInList(values: string[]): string {
  return `(${values.map((value) => JSON.stringify(value)).join(",")})`;
}

export function mergePrependedGalleryRecords(
  saved: ImageGalleryRecord,
  existing: ImageGalleryRecord[],
  limit = DEFAULT_GALLERY_RECORD_LIMIT,
): ImageGalleryRecord[] {
  return [saved, ...existing.filter((item) => item.id !== saved.id)].slice(0, limit);
}

/** 移除 JSONB 中的内联大图，避免 SELECT 触发 statement timeout */
export async function compactGalleryRecords(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("compact_image_gallery_records");
  if (error) {
    // 迁移未 push 时 RPC 不存在；忽略，由全表 migration 或后续部署处理
    if (error.code === "PGRST202" || error.message.includes("compact_image_gallery_records")) {
      return 0;
    }
    throw error;
  }
  return typeof data === "number" ? data : 0;
}

export async function cleanupExpiredGalleryRecords(
  supabase: SupabaseClient,
  retentionDays = GALLERY_RETENTION_DAYS,
): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("image_gallery_records")
    .select("id, data")
    .eq("user_id", user.id)
    .lt("created_at", cutoff);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; data: ImageGalleryRecord }>;
  if (rows.length === 0) return 0;

  await removeGalleryStorageObjects(supabase, galleryRecordStoragePaths(rows, user.id));

  const { error: delError } = await supabase
    .from("image_gallery_records")
    .delete()
    .eq("user_id", user.id)
    .lt("created_at", cutoff);
  if (delError) throw delError;
  return rows.length;
}

export async function listGalleryRecords(
  supabase: SupabaseClient,
  limit = DEFAULT_GALLERY_RECORD_LIMIT,
): Promise<ImageGalleryRecord[]> {
  await cleanupExpiredGalleryRecords(supabase);
  await compactGalleryRecords(supabase);
  const { data, error } = await supabase
    .from("image_gallery_records")
    .select("data, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => withoutInlineGalleryPayload(row.data as ImageGalleryRecord));
}

export async function replaceGalleryRecords(
  supabase: SupabaseClient,
  records: ImageGalleryRecord[],
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  if (records.length === 0) {
    const { data: oldRows, error: oldError } = await supabase
      .from("image_gallery_records")
      .select("data")
      .eq("user_id", user.id);
    if (oldError) throw oldError;
    await removeGalleryStorageObjects(
      supabase,
      galleryRecordStoragePaths((oldRows ?? []) as Array<{ data: ImageGalleryRecord }>, user.id),
    );
    const { error: delError } = await supabase
      .from("image_gallery_records")
      .delete()
      .eq("user_id", user.id);
    if (delError) throw delError;
    return;
  }

  const persisted = await Promise.all(
    records.map((record) => persistGalleryRecordImage(supabase, user.id, record)),
  );
  const rows = persisted.map((record) => toGalleryRow(user.id, record));

  const { error: upsertError } = await supabase
    .from("image_gallery_records")
    .upsert(rows, { onConflict: "id" });
  if (upsertError) throw upsertError;

  const keepIds = persisted.map((record) => record.id);
  const { data: oldRows, error: oldError } = await supabase
    .from("image_gallery_records")
    .select("data")
    .eq("user_id", user.id)
    .not("id", "in", postgrestTextInList(keepIds));
  if (oldError) throw oldError;
  await removeGalleryStorageObjects(
    supabase,
    galleryRecordStoragePaths((oldRows ?? []) as Array<{ data: ImageGalleryRecord }>, user.id),
  );

  const { error: delError } = await supabase
    .from("image_gallery_records")
    .delete()
    .eq("user_id", user.id)
    .not("id", "in", postgrestTextInList(keepIds));
  if (delError) throw delError;
}

export async function prependGalleryRecord(
  supabase: SupabaseClient,
  record: ImageGalleryRecord,
): Promise<ImageGalleryRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  await cleanupExpiredGalleryRecords(supabase);
  if (record.status !== "success" || !record.imageUrl?.trim()) {
    return listGalleryRecords(supabase);
  }

  const persisted = await persistGalleryRecordImage(supabase, user.id, record);

  const { error } = await supabase.from("image_gallery_records").insert(toGalleryRow(user.id, persisted));

  if (error) throw error;
  const existing = await listGalleryRecords(supabase, DEFAULT_GALLERY_RECORD_LIMIT);
  const saved = withoutInlineGalleryPayload(persisted);
  return mergePrependedGalleryRecords(saved, existing);
}

export async function importGalleryRecords(
  supabase: SupabaseClient,
  records: ImageGalleryRecord[],
): Promise<void> {
  if (records.length === 0) return;

  const existing = await listGalleryRecords(supabase);
  if (existing.length > 0) return;

  await replaceGalleryRecords(supabase, records);
}

/** 迁移：为指定用户批量导入 */
export async function importGalleryForUser(
  supabase: SupabaseClient,
  userId: string,
  records: ImageGalleryRecord[],
): Promise<void> {
  if (records.length === 0) return;

  const persisted = await Promise.all(
    records.map((record) => persistGalleryRecordImage(supabase, userId, record)),
  );
  const rows = persisted.map((record) => toGalleryRow(userId, record));

  const { error } = await supabase.from("image_gallery_records").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}
