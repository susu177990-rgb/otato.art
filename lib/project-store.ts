import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as db from "@/lib/db/project-store";
import type { Project, ProjectSummary } from "./types";

export async function listProjects(): Promise<ProjectSummary[]> {
  const supabase = await createSupabaseServerClient();
  return db.listProjects(supabase);
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createSupabaseServerClient();
  return db.getProject(supabase, id);
}

export async function saveProject(project: Project): Promise<void> {
  const supabase = await createSupabaseServerClient();
  return db.saveProject(supabase, project);
}

export async function deleteProject(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  return db.deleteProject(supabase, id);
}
