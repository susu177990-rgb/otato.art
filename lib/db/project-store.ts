import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureProjectCreativeDirection,
  getExistingProjectCreativeDirection,
} from "@/lib/creative-directions";
import { migrateStage5To7 } from "@/lib/project-migrate";
import type { Project, ProjectSummary } from "@/lib/types";

type ProjectSummaryRow = {
  id: string;
  name: string | null;
  data?: Project | null;
  created_at: string;
  updated_at: string;
  creative_direction_id: string | null;
  current_stage: number | null;
  onboarding_status: Project["onboardingStatus"] | null;
  origin_mode: Project["originMode"] | null;
  max_approved_stage: number | null;
  episode_count: string | null;
  series_bible_filled: boolean | null;
};

type ProjectAssetCountType = "character" | "prop" | "scene";
type ProjectResourceCounts = Pick<ProjectSummary, "assetCounts" | "generationCounts">;
type ProjectAssetCountRow = {
  project_id: string | null;
  type: string | null;
};
type GalleryMetadataRow = {
  project_id: string | null;
  status?: string | null;
  image_url?: string | null;
  video_url?: string | null;
};
type GalleryDataRow = {
  project_id: string | null;
  data?: unknown;
};

function emptyResourceCounts(): Required<ProjectResourceCounts> {
  return {
    assetCounts: { character: 0, prop: 0, scene: 0 },
    generationCounts: { image: 0, video: 0 },
  };
}

function toSummary(project: Project): ProjectSummary {
  const direction = getExistingProjectCreativeDirection(project.creativeDirectionId);
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    creativeDirectionId: direction.id,
    creativeDirectionLabel: direction.shortLabel || direction.label,
    currentStage: project.currentStage,
    onboardingStatus: project.onboardingStatus,
    originMode: project.originMode,
    maxApprovedStage: project.maxApprovedStage ?? 0,
    episodeCount: project.meta?.episodeCount ?? "",
    seriesBibleFilled: Boolean((project.seriesBible ?? "").trim()),
    ...emptyResourceCounts(),
  };
}

function isMissingColumn(e: unknown): boolean {
  const message =
    e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : String(e);
  return /does not exist|Could not find|schema cache/i.test(message);
}

function rowToSummary(row: ProjectSummaryRow): ProjectSummary {
  const dataName = row.data && typeof row.data.name === "string" ? row.data.name.trim() : "";
  const direction = getExistingProjectCreativeDirection(row.creative_direction_id ?? undefined);
  return {
    id: row.id,
    name: dataName || row.name?.trim() || "未命名项目",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creativeDirectionId: direction.id,
    creativeDirectionLabel: direction.shortLabel || direction.label,
    currentStage: row.current_stage ?? 0,
    onboardingStatus: row.onboarding_status ?? undefined,
    originMode: row.origin_mode ?? undefined,
    maxApprovedStage: row.max_approved_stage ?? 0,
    episodeCount: row.episode_count ?? "",
    seriesBibleFilled: Boolean(row.series_bible_filled),
    ...emptyResourceCounts(),
  };
}

function ensureCounts(
  countsByProject: Map<string, Required<ProjectResourceCounts>>,
  projectId: string,
): Required<ProjectResourceCounts> {
  const existing = countsByProject.get(projectId);
  if (existing) return existing;
  const next = emptyResourceCounts();
  countsByProject.set(projectId, next);
  return next;
}

function isProjectAssetCountType(value: unknown): value is ProjectAssetCountType {
  return value === "character" || value === "prop" || value === "scene";
}

function isSuccessfulGalleryData(value: unknown, mediaKey: "imageUrl" | "videoUrl"): boolean {
  if (!value || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  if (record.status && record.status !== "success") return false;
  const mediaUrl = record[mediaKey];
  return typeof mediaUrl === "string" ? mediaUrl.trim().length > 0 : true;
}

function isSuccessfulGalleryMetadata(row: GalleryMetadataRow, mediaKey: "image_url" | "video_url"): boolean {
  const status = typeof row.status === "string" ? row.status.trim() : "";
  if (status && status !== "success") return false;
  const mediaUrl = row[mediaKey];
  return typeof mediaUrl === "string" ? mediaUrl.trim().length > 0 : true;
}

function incrementGenerationCount(
  countsByProject: Map<string, Required<ProjectResourceCounts>>,
  projectId: unknown,
  type: keyof Required<ProjectResourceCounts>["generationCounts"],
): void {
  if (typeof projectId !== "string" || !projectId) return;
  ensureCounts(countsByProject, projectId).generationCounts[type] += 1;
}

async function attachImageGenerationCounts(
  supabase: SupabaseClient,
  projectIds: string[],
  countsByProject: Map<string, Required<ProjectResourceCounts>>,
): Promise<void> {
  const metadataRows = await supabase
    .from("image_gallery_records")
    .select("project_id, status, image_url")
    .in("project_id", projectIds);

  if (!metadataRows.error) {
    for (const row of (metadataRows.data ?? []) as GalleryMetadataRow[]) {
      if (isSuccessfulGalleryMetadata(row, "image_url")) {
        incrementGenerationCount(countsByProject, row.project_id, "image");
      }
    }
    return;
  }
  if (!isMissingColumn(metadataRows.error)) throw metadataRows.error;

  const dataRows = await supabase
    .from("image_gallery_records")
    .select("project_id, data")
    .in("project_id", projectIds);

  if (!dataRows.error) {
    for (const row of (dataRows.data ?? []) as GalleryDataRow[]) {
      if (isSuccessfulGalleryData(row.data, "imageUrl")) {
        incrementGenerationCount(countsByProject, row.project_id, "image");
      }
    }
  } else if (!isMissingColumn(dataRows.error)) {
    throw dataRows.error;
  }
}

async function attachProjectAssetCounts(
  supabase: SupabaseClient,
  projectIds: string[],
  countsByProject: Map<string, Required<ProjectResourceCounts>>,
): Promise<void> {
  const assets = await supabase
    .from("project_assets")
    .select("project_id, type")
    .in("project_id", projectIds);

  if (!assets.error) {
    for (const row of (assets.data ?? []) as ProjectAssetCountRow[]) {
      const projectId = typeof row.project_id === "string" ? row.project_id : "";
      if (!projectId || !isProjectAssetCountType(row.type)) continue;
      ensureCounts(countsByProject, projectId).assetCounts[row.type] += 1;
    }
  } else if (!isMissingColumn(assets.error)) {
    throw assets.error;
  }
}

async function attachVideoGenerationCounts(
  supabase: SupabaseClient,
  projectIds: string[],
  countsByProject: Map<string, Required<ProjectResourceCounts>>,
): Promise<void> {
  const metadataRows = await supabase
    .from("video_gallery_records")
    .select("project_id, status, video_url")
    .in("project_id", projectIds);

  if (!metadataRows.error) {
    for (const row of (metadataRows.data ?? []) as GalleryMetadataRow[]) {
      if (isSuccessfulGalleryMetadata(row, "video_url")) {
        incrementGenerationCount(countsByProject, row.project_id, "video");
      }
    }
    return;
  }
  if (!isMissingColumn(metadataRows.error)) throw metadataRows.error;

  const dataRows = await supabase
    .from("video_gallery_records")
    .select("project_id, data")
    .in("project_id", projectIds);

  if (!dataRows.error) {
    for (const row of (dataRows.data ?? []) as GalleryDataRow[]) {
      if (isSuccessfulGalleryData(row.data, "videoUrl")) {
        incrementGenerationCount(countsByProject, row.project_id, "video");
      }
    }
  } else if (!isMissingColumn(dataRows.error)) {
    throw dataRows.error;
  }
}

async function attachProjectResourceCounts(
  supabase: SupabaseClient,
  summaries: ProjectSummary[],
): Promise<ProjectSummary[]> {
  if (summaries.length === 0) return summaries;
  const projectIds = summaries.map((project) => project.id);
  const countsByProject = new Map<string, Required<ProjectResourceCounts>>();
  for (const id of projectIds) ensureCounts(countsByProject, id);

  await Promise.all([
    attachProjectAssetCounts(supabase, projectIds, countsByProject),
    attachImageGenerationCounts(supabase, projectIds, countsByProject),
    attachVideoGenerationCounts(supabase, projectIds, countsByProject),
  ]);

  return summaries.map((project) => ({
    ...project,
    ...ensureCounts(countsByProject, project.id),
  }));
}

export async function listProjects(supabase: SupabaseClient): Promise<ProjectSummary[]> {
  const summary = await supabase
    .from("projects")
    .select(
      "id, name, data, created_at, updated_at, creative_direction_id, current_stage, onboarding_status, origin_mode, max_approved_stage, episode_count, series_bible_filled",
    )
    .order("updated_at", { ascending: false });

  if (!summary.error) return attachProjectResourceCounts(supabase, (summary.data ?? []).map((row) => rowToSummary(row as ProjectSummaryRow)));
  if (!isMissingColumn(summary.error)) throw summary.error;

  const { data, error } = await supabase
    .from("projects")
    .select("data, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const summaries: ProjectSummary[] = [];
  for (const row of data ?? []) {
    try {
      const project = row.data as Project;
      summaries.push(toSummary(project));
    } catch {
      // skip corrupt rows
    }
  }
  return attachProjectResourceCounts(supabase, summaries);
}

export async function getProject(supabase: SupabaseClient, id: string): Promise<Project | null> {
  const { data, error } = await supabase.from("projects").select("data").eq("id", id).maybeSingle();

  if (error) throw error;
  if (!data?.data) return null;

  const project = data.data as Project;
  const migrated = migrateStage5To7(project);
  const directionChanged = ensureProjectCreativeDirection(project);
  const changed = migrated || directionChanged;
  if (changed) {
    await saveProject(supabase, project);
  }
  return project;
}

export async function saveProject(supabase: SupabaseClient, project: Project): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录");

  project.updatedAt = new Date().toISOString();
  migrateStage5To7(project);
  ensureProjectCreativeDirection(project);

  const { error } = await supabase.from("projects").upsert(
    {
      id: project.id,
      user_id: user.id,
      name: project.name,
      data: project,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}

export async function deleteProject(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 迁移脚本：指定 user_id 写入（service role） */
export async function saveProjectForUser(
  supabase: SupabaseClient,
  userId: string,
  project: Project,
): Promise<void> {
  project.updatedAt = project.updatedAt || new Date().toISOString();
  migrateStage5To7(project);
  ensureProjectCreativeDirection(project);

  const { error } = await supabase.from("projects").upsert(
    {
      id: project.id,
      user_id: userId,
      name: project.name,
      data: project,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}
