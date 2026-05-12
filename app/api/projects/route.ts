import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { listProjects, saveProject } from "@/lib/project-store";
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
  const projects = listProjects();
  return Response.json(projects);
}

export async function POST(req: NextRequest) {
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

  saveProject(project);
  return Response.json(project, { status: 201 });
}
