import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureProjectCreativeDirection,
  getExistingProjectCreativeDirection,
} from "@/lib/creative-directions";
import { migrateStage5To7 } from "@/lib/project-migrate";
import type { Project, ProjectSummary } from "@/lib/types";

function toSummary(project: Project): ProjectSummary {
  const direction = getExistingProjectCreativeDirection(project.creativeDirectionId);
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    creativeDirectionId: direction.id,
    creativeDirectionLabel: direction.shortLabel || direction.label,
    currentStage: project.currentStage,
    onboardingStatus: project.onboardingStatus,
    originMode: project.originMode,
    maxApprovedStage: project.maxApprovedStage ?? 0,
    episodeCount: project.meta?.episodeCount ?? "",
    seriesBibleFilled: Boolean((project.seriesBible ?? "").trim()),
  };
}

export async function listProjects(supabase: SupabaseClient): Promise<ProjectSummary[]> {
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
  return summaries;
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
      data: project,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}
