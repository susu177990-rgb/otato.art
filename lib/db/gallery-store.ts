import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { sanitizeGalleryRecordForStorage } from "@/lib/gallery-record-storage";

const DEFAULT_GALLERY_RECORD_LIMIT = 24;

/** 剥离 DB 中不应持久化的内联图（与写入前 sanitize 一致） */
function withoutInlineGalleryPayload(record: ImageGalleryRecord): ImageGalleryRecord {
  return sanitizeGalleryRecordForStorage(record);
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
): Promise<ImageGalleryRecord[]> {
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

  const { error: delError } = await supabase
    .from("image_gallery_records")
    .delete()
    .eq("user_id", user.id);
  if (delError) throw delError;

  if (records.length === 0) return;

  const rows = records.map((record) => ({
    id: record.id,
    user_id: user.id,
    data: sanitizeGalleryRecordForStorage(record),
    created_at: record.createdAt,
  }));

  const { error } = await supabase.from("image_gallery_records").insert(rows);
  if (error) throw error;
}

export async function prependGalleryRecord(
  supabase: SupabaseClient,
  record: ImageGalleryRecord,
): Promise<ImageGalleryRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error } = await supabase.from("image_gallery_records").insert({
    id: record.id,
    user_id: user.id,
    data: sanitizeGalleryRecordForStorage(record),
    created_at: record.createdAt,
  });

  if (error) throw error;
  const existing = await listGalleryRecords(supabase, DEFAULT_GALLERY_RECORD_LIMIT - 1);
  return [withoutInlineGalleryPayload(record), ...existing.filter((item) => item.id !== record.id)];
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

  const rows = records.map((record) => ({
    id: record.id,
    user_id: userId,
    data: sanitizeGalleryRecordForStorage(record),
    created_at: record.createdAt,
  }));

  const { error } = await supabase.from("image_gallery_records").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}
