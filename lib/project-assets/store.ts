import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import type { VideoGalleryRecord } from "@/lib/video-gallery";
import type { ProjectAsset, ProjectAssetInput, ProjectAssetPatch } from "./types";
import {
  normalizePageLimit,
  type ProjectPage,
  type ProjectPageCursor,
} from "@/lib/db/project-scope";

type ProjectAssetRow = {
  id: string;
  project_id: string;
  type: ProjectAsset["type"];
  name: string;
  description: string | null;
  tags: string[] | null;
  primary_image_url: string;
  reference_image_urls: string[] | null;
  created_at: string;
  updated_at: string;
};

function rowToProjectAsset(row: ProjectAssetRow): ProjectAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    name: row.name,
    description: row.description ?? "",
    tags: row.tags ?? [],
    primaryImageUrl: row.primary_image_url,
    referenceImageUrls: row.reference_image_urls ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function projectExists(supabase: SupabaseClient, projectId: string): Promise<boolean> {
  const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listProjectAssets(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectAsset[]> {
  const { data, error } = await supabase
    .from("project_assets")
    .select(
      "id, project_id, type, name, description, tags, primary_image_url, reference_image_urls, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => rowToProjectAsset(row as ProjectAssetRow));
}

export async function listProjectAssetsPage(
  supabase: SupabaseClient,
  projectId: string,
  options: { limit?: number; cursor?: ProjectPageCursor | null } = {},
): Promise<ProjectPage<ProjectAsset>> {
  const limit = normalizePageLimit(options.limit, 24);
  let query = supabase
    .from("project_assets")
    .select(
      "id, project_id, type, name, description, tags, primary_image_url, reference_image_urls, created_at, updated_at",
    )
    .eq("project_id", projectId);
  if (options.cursor) {
    query = query.or(
      `updated_at.lt.${options.cursor.timestamp},and(updated_at.eq.${options.cursor.timestamp},id.lt.${options.cursor.id})`,
    );
  }
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw error;

  const rows = (data ?? []) as ProjectAssetRow[];
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(rowToProjectAsset),
    nextCursor: rows.length > limit && last
      ? { timestamp: last.updated_at, id: last.id }
      : null,
  };
}

export async function getProjectAsset(
  supabase: SupabaseClient,
  projectId: string,
  assetId: string,
): Promise<ProjectAsset | null> {
  const { data, error } = await supabase
    .from("project_assets")
    .select(
      "id, project_id, type, name, description, tags, primary_image_url, reference_image_urls, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProjectAsset(data as ProjectAssetRow) : null;
}

export async function insertProjectAsset(
  supabase: SupabaseClient,
  input: {
    id: string;
    userId: string;
    projectId: string;
    value: ProjectAssetInput;
  },
): Promise<ProjectAsset> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("project_assets")
    .insert({
      id: input.id,
      user_id: input.userId,
      project_id: input.projectId,
      type: input.value.type,
      name: input.value.name,
      description: input.value.description ?? "",
      tags: input.value.tags ?? [],
      primary_image_url: input.value.primaryImageUrl,
      reference_image_urls: input.value.referenceImageUrls ?? [],
      created_at: now,
      updated_at: now,
    })
    .select(
      "id, project_id, type, name, description, tags, primary_image_url, reference_image_urls, created_at, updated_at",
    )
    .single();
  if (error) throw error;
  return rowToProjectAsset(data as ProjectAssetRow);
}

export async function updateProjectAsset(
  supabase: SupabaseClient,
  projectId: string,
  assetId: string,
  patch: ProjectAssetPatch,
): Promise<ProjectAsset | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.primaryImageUrl !== undefined) row.primary_image_url = patch.primaryImageUrl;
  if (patch.referenceImageUrls !== undefined) row.reference_image_urls = patch.referenceImageUrls;
  const { data, error } = await supabase
    .from("project_assets")
    .update(row)
    .eq("project_id", projectId)
    .eq("id", assetId)
    .select(
      "id, project_id, type, name, description, tags, primary_image_url, reference_image_urls, created_at, updated_at",
    )
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProjectAsset(data as ProjectAssetRow) : null;
}

export async function deleteProjectAsset(
  supabase: SupabaseClient,
  projectId: string,
  assetId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("project_assets")
    .delete()
    .eq("project_id", projectId)
    .eq("id", assetId)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getProjectImageGalleryRecord(
  supabase: SupabaseClient,
  projectId: string,
  recordId: string,
): Promise<ImageGalleryRecord | null> {
  const { data, error } = await supabase
    .from("image_gallery_records")
    .select("data")
    .eq("project_id", projectId)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as ImageGalleryRecord | undefined) ?? null;
}

export async function listProjectImageGalleryRecords(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ImageGalleryRecord[]> {
  const { data, error } = await supabase
    .from("image_gallery_records")
    .select("data")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.data as ImageGalleryRecord);
}

export async function listProjectVideoGalleryRecords(
  supabase: SupabaseClient,
  projectId: string,
): Promise<VideoGalleryRecord[]> {
  const { data, error } = await supabase
    .from("video_gallery_records")
    .select("data")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.data as VideoGalleryRecord);
}
