import type { SupabaseClient } from "@supabase/supabase-js";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import { sanitizeVideoGalleryRecordForStorage } from "@/lib/video-gallery-record-storage";
import {
  isStoredGeneratedVideoUrl,
  persistGeneratedVideoToStorage,
} from "@/lib/db/persist-generated-video";
import { deleteMediaObjects, mediaObjectKeyFromPublicUrl } from "@/lib/media-storage";
import {
  applyProjectScope,
  normalizePageLimit,
  type ProjectPage,
  type ProjectPageOptions,
  type ProjectScope,
} from "@/lib/db/project-scope";

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
  scope: ProjectScope = {},
): Promise<VideoGalleryRecord[]> {
  const query = applyProjectScope(
    supabase
    .from("video_gallery_records")
      .select("data, created_at"),
    scope,
  );
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => sanitizeVideoGalleryRecordForStorage(row.data as VideoGalleryRecord));
}

export async function listVideoGalleryRecordsPage(
  supabase: SupabaseClient,
  options: ProjectPageOptions = {},
): Promise<ProjectPage<VideoGalleryRecord>> {
  const limit = normalizePageLimit(options.limit, DEFAULT_VIDEO_GALLERY_RECORD_LIMIT);
  let query = applyProjectScope(
    supabase.from("video_gallery_records").select("id, data, created_at"),
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
    items: pageRows.map((row) => sanitizeVideoGalleryRecordForStorage(row.data as VideoGalleryRecord)),
    nextCursor: rows.length > limit && last
      ? { timestamp: last.created_at, id: last.id }
      : null,
  };
}

export async function getVideoGalleryRecord(
  supabase: SupabaseClient,
  id: string,
  scope: ProjectScope = {},
): Promise<VideoGalleryRecord | null> {
  const query = applyProjectScope(
    supabase.from("video_gallery_records").select("data").eq("id", id),
    scope,
  );
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? sanitizeVideoGalleryRecordForStorage(data.data as VideoGalleryRecord) : null;
}

export async function replaceVideoGalleryRecords(
  supabase: SupabaseClient,
  records: VideoGalleryRecord[],
  scope: ProjectScope = {},
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const deleteQuery = applyProjectScope(
    supabase
    .from("video_gallery_records")
    .delete()
      .eq("user_id", user.id),
    scope,
  );
  const { error: delError } = await deleteQuery;
  if (delError) throw delError;

  if (records.length === 0) return;

  const persisted = await Promise.all(records.map((r) => persistVideoRecordMedia(supabase, user.id, r)));
  const rows = persisted.map((record) => ({
    id: record.id,
    user_id: user.id,
    project_id: scope.projectId ?? null,
    data: sanitizeVideoGalleryRecordForStorage(record),
    created_at: record.createdAt,
  }));
  const { error } = await supabase.from("video_gallery_records").insert(rows);
  if (error) throw error;
}

export async function prependVideoGalleryRecord(
  supabase: SupabaseClient,
  record: VideoGalleryRecord,
  scope: ProjectScope = {},
): Promise<VideoGalleryRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  const persisted = await persistVideoRecordMedia(supabase, user.id, record);
  const { error } = await supabase.from("video_gallery_records").insert({
    id: persisted.id,
    user_id: user.id,
    project_id: scope.projectId ?? null,
    data: sanitizeVideoGalleryRecordForStorage(persisted),
    created_at: persisted.createdAt,
  });
  if (error) throw error;
  const existing = await listVideoGalleryRecords(supabase, DEFAULT_VIDEO_GALLERY_RECORD_LIMIT - 1, scope);
  const saved = sanitizeVideoGalleryRecordForStorage(persisted);
  return [saved, ...existing.filter((item) => item.id !== saved.id)];
}

export async function importVideoGalleryRecords(
  supabase: SupabaseClient,
  records: VideoGalleryRecord[],
  scope: ProjectScope = {},
): Promise<void> {
  if (records.length === 0) return;
  const existing = await listVideoGalleryRecords(supabase, DEFAULT_VIDEO_GALLERY_RECORD_LIMIT, scope);
  if (existing.length > 0) return;
  await replaceVideoGalleryRecords(supabase, records, scope);
}

export async function deleteVideoGalleryRecord(
  supabase: SupabaseClient,
  id: string,
  scope: ProjectScope = {},
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");
  const existing = await getVideoGalleryRecord(supabase, id, scope);
  const query = applyProjectScope(
    supabase.from("video_gallery_records").delete().eq("user_id", user.id).eq("id", id).select("id"),
    scope,
  );
  const { data, error } = await query;
  if (error) throw error;
  const deleted = (data?.length ?? 0) > 0;
  if (!deleted) return false;

  const key = existing?.videoUrl ? mediaObjectKeyFromPublicUrl(existing.videoUrl) : null;
  if (key?.startsWith(`${user.id}/`) || key?.startsWith(`ephemeral/${user.id}/`)) {
    await deleteMediaObjects([key]).catch((cleanupError) => {
      console.warn("[video/gallery storage cleanup]", cleanupError);
    });
  }
  return true;
}
