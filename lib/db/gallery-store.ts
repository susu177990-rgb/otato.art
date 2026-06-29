import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { sanitizeGalleryRecordForStorage } from "@/lib/gallery-record-storage";
import { persistGeneratedImageWithThumbnailToStorage } from "@/lib/db/persist-generated-image";
import { isStoredGeneratedImageUrl } from "@/lib/generated-image-storage";
import { deleteMediaObjects, mediaObjectKeyFromPublicUrl } from "@/lib/media-storage";
import {
  applyProjectScope,
  normalizePageLimit,
  type ProjectPage,
  type ProjectPageOptions,
  type ProjectScope,
} from "@/lib/db/project-scope";

const DEFAULT_GALLERY_RECORD_LIMIT = 24;

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

function toGalleryRow(userId: string, record: ImageGalleryRecord, scope: ProjectScope = {}) {
  return {
    id: record.id,
    user_id: userId,
    project_id: scope.projectId ?? null,
    data: sanitizeGalleryRecordForStorage(record),
    created_at: record.createdAt,
  };
}

function storedGeneratedImagePath(url: string, userId: string): string | null {
  if (!isStoredGeneratedImageUrl(url)) return null;
  const path = mediaObjectKeyFromPublicUrl(url);
  if (!path?.startsWith(`${userId}/`) && !path?.startsWith(`ephemeral/${userId}/`)) return null;
  return path;
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
  await deleteMediaObjects(uniquePaths).catch((error) => console.warn("[image/gallery storage cleanup]", error));
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

export async function listGalleryRecords(
  supabase: SupabaseClient,
  limit = DEFAULT_GALLERY_RECORD_LIMIT,
  scope: ProjectScope = {},
): Promise<ImageGalleryRecord[]> {
  await compactGalleryRecords(supabase);
  const query = applyProjectScope(
    supabase.from("image_gallery_records").select("data, created_at"),
    scope,
  );
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => withoutInlineGalleryPayload(row.data as ImageGalleryRecord));
}

export async function listGalleryRecordsPage(
  supabase: SupabaseClient,
  options: ProjectPageOptions = {},
): Promise<ProjectPage<ImageGalleryRecord>> {
  const limit = normalizePageLimit(options.limit, DEFAULT_GALLERY_RECORD_LIMIT);
  await compactGalleryRecords(supabase);
  let query = applyProjectScope(
    supabase.from("image_gallery_records").select("id, data, created_at"),
    options,
  );
  if (options.cursor) {
    query = query.or(
      `created_at.lt.${options.cursor.timestamp},and(created_at.eq.${options.cursor.timestamp},id.lt.${options.cursor.id})`,
    );
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map((row) => withoutInlineGalleryPayload(row.data as ImageGalleryRecord)),
    nextCursor: rows.length > limit && last
      ? { timestamp: last.created_at, id: last.id }
      : null,
  };
}

export async function getGalleryRecord(
  supabase: SupabaseClient,
  id: string,
  scope: ProjectScope = {},
): Promise<ImageGalleryRecord | null> {
  const query = applyProjectScope(
    supabase.from("image_gallery_records").select("data").eq("id", id),
    scope,
  );
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? withoutInlineGalleryPayload(data.data as ImageGalleryRecord) : null;
}

export async function replaceGalleryRecords(
  supabase: SupabaseClient,
  records: ImageGalleryRecord[],
  scope: ProjectScope = {},
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  if (records.length === 0) {
    const oldQuery = applyProjectScope(
      supabase
        .from("image_gallery_records")
        .select("data")
        .eq("user_id", user.id),
      scope,
    );
    const { data: oldRows, error: oldError } = await oldQuery;
    if (oldError) throw oldError;
    await removeGalleryStorageObjects(
      supabase,
      galleryRecordStoragePaths((oldRows ?? []) as Array<{ data: ImageGalleryRecord }>, user.id),
    );
    const deleteQuery = applyProjectScope(
      supabase
        .from("image_gallery_records")
        .delete()
        .eq("user_id", user.id),
      scope,
    );
    const { error: delError } = await deleteQuery;
    if (delError) throw delError;
    return;
  }

  const persisted = await Promise.all(
    records.map((record) => persistGalleryRecordImage(supabase, user.id, record)),
  );
  const rows = persisted.map((record) => toGalleryRow(user.id, record, scope));

  const { error: upsertError } = await supabase
    .from("image_gallery_records")
    .upsert(rows, { onConflict: "id" });
  if (upsertError) throw upsertError;

  const keepIds = persisted.map((record) => record.id);
  const oldQuery = applyProjectScope(
    supabase
      .from("image_gallery_records")
      .select("data")
      .eq("user_id", user.id)
      .not("id", "in", postgrestTextInList(keepIds)),
    scope,
  );
  const { data: oldRows, error: oldError } = await oldQuery;
  if (oldError) throw oldError;
  await removeGalleryStorageObjects(
    supabase,
    galleryRecordStoragePaths((oldRows ?? []) as Array<{ data: ImageGalleryRecord }>, user.id),
  );

  const deleteQuery = applyProjectScope(
    supabase
      .from("image_gallery_records")
      .delete()
      .eq("user_id", user.id)
      .not("id", "in", postgrestTextInList(keepIds)),
    scope,
  );
  const { error: delError } = await deleteQuery;
  if (delError) throw delError;
}

export async function prependGalleryRecord(
  supabase: SupabaseClient,
  record: ImageGalleryRecord,
  scope: ProjectScope = {},
): Promise<ImageGalleryRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  if (record.status !== "success" || !record.imageUrl?.trim()) {
    return listGalleryRecords(supabase, DEFAULT_GALLERY_RECORD_LIMIT, scope);
  }

  const persisted = await persistGalleryRecordImage(supabase, user.id, record);

  const { error } = await supabase.from("image_gallery_records").insert(toGalleryRow(user.id, persisted, scope));

  if (error) throw error;
  const existing = await listGalleryRecords(supabase, DEFAULT_GALLERY_RECORD_LIMIT, scope);
  const saved = withoutInlineGalleryPayload(persisted);
  return mergePrependedGalleryRecords(saved, existing);
}

export async function importGalleryRecords(
  supabase: SupabaseClient,
  records: ImageGalleryRecord[],
  scope: ProjectScope = {},
): Promise<void> {
  if (records.length === 0) return;

  const existing = await listGalleryRecords(supabase, DEFAULT_GALLERY_RECORD_LIMIT, scope);
  if (existing.length > 0) return;

  await replaceGalleryRecords(supabase, records, scope);
}

export async function deleteGalleryRecord(
  supabase: SupabaseClient,
  id: string,
  scope: ProjectScope = {},
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const existingQuery = applyProjectScope(
    supabase.from("image_gallery_records").select("data").eq("user_id", user.id).eq("id", id),
    scope,
  );
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return false;
  await removeGalleryStorageObjects(
    supabase,
    galleryRecordStoragePaths([existing as { data: ImageGalleryRecord }], user.id),
  );
  const deleteQuery = applyProjectScope(
    supabase.from("image_gallery_records").delete().eq("user_id", user.id).eq("id", id).select("id"),
    scope,
  );
  const { data, error } = await deleteQuery;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 迁移：为指定用户批量导入 */
export async function importGalleryForUser(
  supabase: SupabaseClient,
  userId: string,
  records: ImageGalleryRecord[],
  scope: ProjectScope = {},
): Promise<void> {
  if (records.length === 0) return;

  const persisted = await Promise.all(
    records.map((record) => persistGalleryRecordImage(supabase, userId, record)),
  );
  const rows = persisted.map((record) => toGalleryRow(userId, record, scope));

  const { error } = await supabase.from("image_gallery_records").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}
