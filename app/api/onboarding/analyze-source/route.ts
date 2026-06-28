import { NextRequest } from "next/server";
import { getProject, saveProject } from "@/lib/project-store";
import { loadAdaptationAnalyzePrompt } from "@/lib/prompt-loader";
import { completeChatNonStream } from "@/lib/openai-completion";
import { totalSourceChars } from "@/lib/source-materials";
import { buildCreativeDirectionContext } from "@/lib/creative-directions";
import { requireCurrentUserLlmSettings } from "@/lib/api/current-user-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingStatus, Project } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 单次「分析原文」送入模型的拼接正文上限（字符）。
 * 注意：实际能否成功取决于所选模型的上下文总长（system + 本文 + 回复）；
 * 常见模型总上下文有限（如约 128k～1M tokens 视型号而定），百万级字符英文稿极易超出而报 context_length_exceeded，
 * 需换长上下文模型或后续改为分段分析。
 */
const ANALYZE_INPUT_MAX = 1_000_000;

export async function POST(req: NextRequest) {
  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.projectId;
  const supabase = await createSupabaseServerClient();
  const current = await requireCurrentUserLlmSettings(supabase);
  if (!current.ok) return current.response;
  const settings = current.settings;
  if (!projectId) {
    return Response.json({ error: "缺少 projectId，或网站内部 LLM API 暂未配置，请联系管理员。" }, { status: 400 });
  }

  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  const mats = project.sourceMaterials ?? [];
  if (mats.length === 0) {
    return Response.json({ error: "请先上传或粘贴至少一份原文素材" }, { status: 400 });
  }

  const total = totalSourceChars(mats);
  let raw = mats.map((m) => `### ${m.label}\n${m.text}`).join("\n\n");
  if (raw.length > ANALYZE_INPUT_MAX) {
    raw = raw.slice(0, ANALYZE_INPUT_MAX) + "\n\n（后略：为控制单次请求长度已截断）";
  }

  const system = loadAdaptationAnalyzePrompt();
  if (!system.trim()) {
    return Response.json({ error: "分析提示词未加载" }, { status: 500 });
  }

  const systemContent = `${system}\n\n---\n【创作方向】\n${buildCreativeDirectionContext(project.creativeDirectionId)}`;
  const userContent = `以下是需要分析的原文（项目内素材合计约 ${total} 字）：\n\n${raw}`;

  const result = await completeChatNonStream({
    settings,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const sourceAnalysis = result.content.trim();
  const onboardingStatus: OnboardingStatus =
    project.onboardingStatus === "ready" ? "ready" : "planning";

  const merged: Project = {
    ...project,
    originMode: "adaptation" as const,
    sourceAnalysis,
    adaptationPhase: "analyzed" as const,
    onboardingStatus,
  };
  await saveProject(merged);

  return Response.json({
    ok: true,
    sourceAnalysisLength: sourceAnalysis.length,
    project: merged,
  });
}
