import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { sanitizeVideoGalleryRecordForStorage } from "@/lib/video-gallery-record-storage";
import {
  isStoredGeneratedVideoUrl,
  persistGeneratedVideoToStorage,
} from "@/lib/db/persist-generated-video";

const DEFAULT_VIDEO_GALLERY_RECORD_LIMIT = 24;

async function persistVideoRecordMedia(
  supabase: SupabaseClient,
  userId: string,
  record: VideoGalleryRecord,
): Promise<VideoGalleryRecord> {
  const url = record.videoUrl?.trim();
  if (!url || isStoredGeneratedVideoUrl(url)) return record;
  const stored = await persistGeneratedVideoToStorage(supabase, userId, url, record.id);
  return { ...record, videoUrl: stored };
}

export async function listVideoGalleryRecords(
  supabase: SupabaseClient,
  limit = DEFAULT_VIDEO_GALLERY_RECORD_LIMIT,
): Promise<VideoGalleryRecord[]> {
  const { data, error } = await supabase
    .from("video_gallery_records")
    .select("data, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => sanitizeVideoGalleryRecordForStorage(row.data as VideoGalleryRecord));
}

export async function replaceVideoGalleryRecords(
  supabase: SupabaseClient,
  records: VideoGalleryRecord[],
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const { error: delError } = await supabase
    .from("video_gallery_records")
    .delete()
    .eq("user_id", user.id);
  if (delError) throw delError;

  if (records.length === 0) return;

  const persisted = await Promise.all(records.map((r) => persistVideoRecordMedia(supabase, user.id, r)));
  const rows = persisted.map((record) => ({
    id: record.id,
    user_id: user.id,
    data: sanitizeVideoGalleryRecordForStorage(record),
    created_at: record.createdAt,
  }));
  const { error } = await supabase.from("video_gallery_records").insert(rows);
  if (error) throw error;
}

export async function prependVideoGalleryRecord(
  supabase: SupabaseClient,
  record: VideoGalleryRecord,
): Promise<VideoGalleryRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const persisted = await persistVideoRecordMedia(supabase, user.id, record);
  const { error } = await supabase.from("video_gallery_records").insert({
    id: persisted.id,
    user_id: user.id,
    data: sanitizeVideoGalleryRecordForStorage(persisted),
    created_at: persisted.createdAt,
  });
  if (error) throw error;
  const existing = await listVideoGalleryRecords(supabase, DEFAULT_VIDEO_GALLERY_RECORD_LIMIT - 1);
  const saved = sanitizeVideoGalleryRecordForStorage(persisted);
  return [saved, ...existing.filter((item) => item.id !== saved.id)];
}

export async function importVideoGalleryRecords(
  supabase: SupabaseClient,
  records: VideoGalleryRecord[],
): Promise<void> {
  if (records.length === 0) return;
  const existing = await listVideoGalleryRecords(supabase);
  if (existing.length > 0) return;
  await replaceVideoGalleryRecords(supabase, records);
}

