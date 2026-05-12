import { NextRequest } from "next/server";
import { getProject } from "@/lib/project-store";
import { generatePrefillMetaFromProject } from "@/lib/onboarding-prefill-meta";
import type { Project, Settings } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    projectId?: string;
    settings?: Settings;
    /** 为 true 时仅以《创作思路确认书》长文为主调用预填（须已有或随 override 传入正文） */
    fromBriefOnly?: boolean;
    /** 可选：用当前页编辑框正文代替库里确认书参与预填（不写库） */
    creativeBriefOverride?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.projectId;
  const settings = body.settings;
  if (!projectId || !settings?.apiKey) {
    return Response.json({ error: "需要 projectId 与 settings.apiKey" }, { status: 400 });
  }

  const existing = getProject(projectId);
  if (!existing) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const override =
    typeof body.creativeBriefOverride === "string" ? body.creativeBriefOverride.trim() : "";
  const project: Project =
    override.length > 0 ? { ...existing, creativeBrief: override } : existing;

  if (body.fromBriefOnly && !(project.creativeBrief ?? "").trim()) {
    return Response.json({ error: "缺少《创作思路确认书》" }, { status: 400 });
  }

  const out = await generatePrefillMetaFromProject(project, settings, {
    fromBriefOnly: Boolean(body.fromBriefOnly),
  });
  if (!out.ok) {
    return Response.json({ error: out.error, meta: out.meta }, { status: 502 });
  }

  return Response.json({ ok: true, meta: out.meta });
}
