import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageGalleryRecord } from "@/lib/image-workspace";

export async function listGalleryRecords(supabase: SupabaseClient): Promise<ImageGalleryRecord[]> {
  const { data, error } = await supabase
    .from("image_gallery_records")
    .select("data, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => row.data as ImageGalleryRecord);
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
    data: record,
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
    data: record,
    created_at: record.createdAt,
  });

  if (error) throw error;
  return listGalleryRecords(supabase);
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
    data: record,
    created_at: record.createdAt,
  }));

  const { error } = await supabase.from("image_gallery_records").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}
