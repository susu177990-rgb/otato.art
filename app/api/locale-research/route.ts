import { NextRequest } from "next/server";
import { getProject } from "@/lib/project-store";
import { completeEnglishLocaleBrief } from "@/lib/locale-research";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";

type Body = {
  projectId?: string;
  settings?: Settings;
  /** 立项弹窗草稿：若提供则临时覆盖项目内同名字段参与生成（不写库） */
  creativeBriefOverride?: string;
  seriesBibleOverride?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const settings = body.settings;
  if (!projectId) {
    return Response.json({ error: "缺少 projectId" }, { status: 400 });
  }
  if (!settings?.apiKey?.trim()) {
    return Response.json(
      { error: "请先在编剧室设置中填写 API Key，与对话使用同一套模型配置。" },
      { status: 400 }
    );
  }

  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const cbRaw = typeof body.creativeBriefOverride === "string" ? body.creativeBriefOverride.trim() : "";
  const sbRaw = typeof body.seriesBibleOverride === "string" ? body.seriesBibleOverride.trim() : "";
  const cb = cbRaw.length > 0 ? cbRaw : undefined;
  const sb = sbRaw.length > 0 ? sbRaw : undefined;
  const work =
    cb !== undefined || sb !== undefined
      ? {
          ...project,
          ...(cb !== undefined ? { creativeBrief: cb } : {}),
          ...(sb !== undefined ? { seriesBible: sb } : {}),
        }
      : project;

  const out = await completeEnglishLocaleBrief(work, settings);
  if (!out.ok) {
    return Response.json({ error: out.error }, { status: 502 });
  }

  return Response.json({ markdown: out.markdown });
}
