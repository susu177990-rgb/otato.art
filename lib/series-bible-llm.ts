import { completeChatNonStream } from "@/lib/openai-completion";
import { loadSeriesBibleGeneratorPrompt } from "@/lib/prompt-loader";
import {
  ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS,
  PLANNING_EXCERPT_PER_MATERIAL,
} from "@/lib/source-materials";
import type { Project, ProjectMeta, Settings, SourceMaterial } from "@/lib/types";

const USER_SERIES_BIBLE_REQUEST =
  "请严格遵循系统提示中的输出结构与写作要求，直接输出完整 Markdown《系列圣经》正文：从一级标题「# 系列圣经与里程碑（SERIES_BIBLE）」开始，不要前言、不要向用户提问、不要输出 STAGE 1～5 剧本模板。";

function excerpt(s: string, max: number): string {
  const t = s.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…（后略）`;
}

function metaLines(meta: ProjectMeta | undefined, fallbackName: string): string {
  const m = meta;
  return [
    `剧名：${m?.seriesTitle?.trim() || fallbackName}`,
    `集数/区间：${m?.episodeCount?.trim() || "待确认"}`,
    `单集约时长（分钟）：${m?.episodeDurationMinutes ?? "?"}`,
    `目标市场：${m?.targetMarket?.trim() || "待确认"}`,
    `台词语言：${m?.dialogueLanguage?.trim() || "待确认"}`,
    `备注：${m?.extraNotes?.trim() || "无"}`,
  ].join("\n");
}

function materialsBlock(materials: SourceMaterial[] | undefined): string {
  if (!materials?.length) return "（无立项素材）";
  return materials
    .map((mat, i) => {
      const label = mat.label?.trim() || `素材${i + 1}`;
      const body = excerpt(mat.text ?? "", PLANNING_EXCERPT_PER_MATERIAL);
      return `### ${label}\n${body || "（空）"}`;
    })
    .join("\n\n");
}

export function buildSeriesBibleUserContext(project: Project): string {
  const meta = project.meta;
  const name = project.name?.trim() || "未命名项目";
  const brief = (project.creativeBrief ?? "").trim();
  const parts: string[] = [
    "【立项元数据】",
    metaLines(meta, name),
    "",
    "【《创作思路确认书》全文】",
    brief,
  ];

  const mode = project.originMode ?? "original";
  if (mode === "adaptation") {
    const sa = excerpt(project.sourceAnalysis ?? "", ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS);
    parts.push("", "【原文分析（摘录）】", sa || "（无）", "", "【改编立项素材（摘录）】", materialsBlock(project.sourceMaterials));
  }

  return parts.join("\n");
}

export type SeriesBibleLlmOptions = {
  creativeBriefOverride?: string;
  replaceExisting?: boolean;
  allowWithProgress?: boolean;
};

export type SeriesBibleLlmResult =
  | { ok: true; seriesBible: string }
  | { ok: false; error: string; kind?: "missing_brief" | "bible_exists" | "has_progress" | "no_prompt" | "llm" | "empty_output" };

/**
 * 调用模型生成系列圣经正文（不写库）。HTTP 路由与改编规划链式生成共用。
 */
export async function completeSeriesBibleLlm(
  existing: Project,
  settings: Settings,
  opts?: SeriesBibleLlmOptions
): Promise<SeriesBibleLlmResult> {
  const replaceExisting = Boolean(opts?.replaceExisting);
  const allowWithProgress = Boolean(opts?.allowWithProgress);
  const override =
    typeof opts?.creativeBriefOverride === "string" ? opts.creativeBriefOverride.trim() : "";
  const brief = (override || (existing.creativeBrief ?? "").trim()).trim();
  if (!brief) {
    return { ok: false, error: "缺少《创作思路确认书》，无法生成系列圣经", kind: "missing_brief" };
  }

  const contextProject: Project =
    override.length > 0 ? { ...existing, creativeBrief: override } : existing;

  if (!replaceExisting && (existing.seriesBible ?? "").trim().length > 0) {
    return { ok: false, error: "系列圣经已存在，拒绝覆盖", kind: "bible_exists" };
  }

  if (
    !replaceExisting &&
    !allowWithProgress &&
    ((existing.messages?.length ?? 0) > 0 || (existing.artifacts?.length ?? 0) > 0)
  ) {
    return {
      ok: false,
      error: "项目已有对话或产物，请直接在侧栏编辑系列圣经",
      kind: "has_progress",
    };
  }

  const base = loadSeriesBibleGeneratorPrompt();
  if (!base.trim()) {
    return { ok: false, error: "系列圣经生成提示词未加载", kind: "no_prompt" };
  }

  const systemContent = `${base}\n\n---\n【立项上下文】\n${buildSeriesBibleUserContext(contextProject)}`;

  const result = await completeChatNonStream({
    settings,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: USER_SERIES_BIBLE_REQUEST },
    ],
    temperature: 0.25,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, kind: "llm" };
  }

  const seriesBible = result.content.trim();
  if (!seriesBible) {
    return { ok: false, error: "模型未返回系列圣经正文", kind: "empty_output" };
  }

  return { ok: true, seriesBible };
}
