import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listProjects, saveProject } from "@/lib/db/project-store";
import type { Project, ProjectMeta } from "@/lib/types";

const emptyMeta = (): ProjectMeta => ({
  seriesTitle: "",
  episodeCount: "",
  episodeDurationMinutes: null,
  targetMarket: "",
  dialogueLanguage: "",
  extraNotes: "",
});

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const projects = await listProjects(supabase);
  return Response.json(projects);
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = body.name || "未命名项目";
  const now = new Date().toISOString();

  const project: Project = {
    id: nanoid(12),
    name,
    createdAt: now,
    updatedAt: now,
    currentStage: 0,
    messages: [],
    artifacts: [],
    seriesBible: "",
    maxApprovedStage: 0,
    meta: emptyMeta(),
    sourceMaterials: [],
    onboardingStatus: "pending_setup",
    creativeBrief: "",
    planningMessages: [],
    originMode: "original",
    adaptationPhase: "idle",
    sourceAnalysis: "",
    adaptationMessages: [],
  };

  await saveProject(supabase, project);
  return Response.json(project, { status: 201 });
}
