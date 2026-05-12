import { NextRequest } from "next/server";
import { completeSeriesBibleLlm } from "@/lib/series-bible-llm";
import { getProject, saveProject } from "@/lib/project-store";
import type { Project, Settings } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    projectId?: string;
    settings?: Settings;
    allowWithProgress?: boolean;
    replaceExisting?: boolean;
    creativeBriefOverride?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.projectId;
  const settings = body.settings;
  const allowWithProgress = Boolean(body.allowWithProgress);
  const replaceExisting = Boolean(body.replaceExisting);
  if (!projectId || !settings?.apiKey) {
    return Response.json({ error: "需要 projectId 与 settings.apiKey" }, { status: 400 });
  }

  const existing = getProject(projectId);
  if (!existing) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const out = await completeSeriesBibleLlm(existing, settings, {
    creativeBriefOverride: body.creativeBriefOverride,
    replaceExisting,
    allowWithProgress,
  });

  if (!out.ok) {
    if (out.kind === "missing_brief") return Response.json({ error: out.error }, { status: 400 });
    if (out.kind === "bible_exists") return Response.json({ error: out.error }, { status: 409 });
    if (out.kind === "has_progress") return Response.json({ error: out.error }, { status: 400 });
    if (out.kind === "no_prompt") return Response.json({ error: out.error }, { status: 500 });
    return Response.json({ error: out.error }, { status: 502 });
  }

  const merged: Project = { ...existing, seriesBible: out.seriesBible };
  saveProject(merged);

  return Response.json({ ok: true, project: merged });
}
