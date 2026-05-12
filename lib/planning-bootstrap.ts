import type { Message, ProjectMeta, SourceMaterial } from "./types";
import {
  ADAPTATION_DISCUSSION_FOR_PLANNER_CHARS,
  ADAPTATION_PLANNING_EXCERPT_CHARS,
  ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS,
  PLANNING_EXCERPT_PER_MATERIAL,
} from "./source-materials";

/**
 * 策划 API 附在系统提示后的立项素材块（节选，控 token）。
 */
export function buildPlanningBootstrap(meta: ProjectMeta | undefined, materials: SourceMaterial[]): string {
  const m = meta ?? {
    seriesTitle: "",
    episodeCount: "",
    episodeDurationMinutes: null,
    targetMarket: "",
    dialogueLanguage: "",
    extraNotes: "",
  };
  const lines: string[] = [];
  lines.push("### 元数据");
  lines.push(`- 剧名：${m.seriesTitle || "（未填）"}`);
  lines.push(`- 目标集数/区间：${m.episodeCount || "（未填）"}`);
  lines.push(`- 单集时长目标（分钟）：${m.episodeDurationMinutes ?? "（未填）"}`);
  lines.push(`- 目标市场：${m.targetMarket || "（未填）"}`);
  lines.push(`- 台词语言：${m.dialogueLanguage || "（未填）"}`);
  if (m.extraNotes?.trim()) lines.push(`- 备注：${m.extraNotes.trim()}`);
  lines.push("");
  lines.push("### 素材节选（每份最多 " + PLANNING_EXCERPT_PER_MATERIAL + " 字）");
  if (materials.length === 0) {
    lines.push("（无上传素材；请向主创追问或依赖对话补充）");
  } else {
    for (const mat of materials) {
      const raw = mat.text || "";
      const truncated = raw.length > PLANNING_EXCERPT_PER_MATERIAL;
      const body = truncated ? raw.slice(0, PLANNING_EXCERPT_PER_MATERIAL) : raw;
      lines.push(`#### ${mat.label} [${mat.kind}]`);
      if (truncated) lines.push("（正文过长已截断，关键设定请向主创追问）");
      lines.push(body);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function excerptText(s: string, max: number): string {
  const t = s?.trim() ?? "";
  if (!t) return "（无）";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n（后略，共 ${t.length} 字）`;
}

function excerptMessages(msgs: Message[], maxChars: number): string {
  if (!msgs?.length) return "（尚无对话）";
  const lines = msgs.map((m) => `**${m.role}**：${m.content}`);
  const joined = lines.join("\n\n");
  return excerptText(joined, maxChars);
}

/**
 * 改编讨论 API：系统提示后附原文分析 + 可选素材节选。
 */
export function buildAdaptationDiscussBootstrap(
  sourceAnalysis: string | undefined,
  materials: SourceMaterial[]
): string {
  const lines: string[] = [];
  lines.push("### 原文分析（模型整理）");
  lines.push(excerptText(sourceAnalysis ?? "", ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS));
  lines.push("");
  lines.push("### 素材节选（每份最多 " + PLANNING_EXCERPT_PER_MATERIAL + " 字）");
  if (materials.length === 0) {
    lines.push("（无额外素材）");
  } else {
    for (const mat of materials) {
      const raw = mat.text || "";
      const truncated = raw.length > PLANNING_EXCERPT_PER_MATERIAL;
      const body = truncated ? raw.slice(0, PLANNING_EXCERPT_PER_MATERIAL) : raw;
      lines.push(`#### ${mat.label} [${mat.kind}]`);
      if (truncated) lines.push("（正文过长已截断）");
      lines.push(body);
      lines.push("");
    }
  }
  return lines.join("\n");
}

/**
 * 改编规划师：元数据/素材节选 + 原文分析 + 改编讨论（长摘录）+ 规划师对话（用于 planning-chat adaptation_planner）。
 */
export function buildAdaptationPlannerBootstrap(params: {
  meta: ProjectMeta | undefined;
  materials: SourceMaterial[];
  sourceAnalysis: string | undefined;
  adaptationMessages: Message[];
  planningMessages: Message[];
}): string {
  const { meta, materials, sourceAnalysis, adaptationMessages, planningMessages } = params;
  const lines: string[] = [];
  lines.push(buildPlanningBootstrap(meta, materials));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### 原文分析");
  lines.push(excerptText(sourceAnalysis ?? "", ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS));
  lines.push("");
  lines.push("### 改编讨论（须作为规划依据；以下为长摘录）");
  lines.push(excerptMessages(adaptationMessages, ADAPTATION_DISCUSSION_FOR_PLANNER_CHARS));
  lines.push("");
  lines.push("### 规划师对话（摘录，含当前线程）");
  lines.push(excerptMessages(planningMessages, ADAPTATION_PLANNING_EXCERPT_CHARS));
  return lines.join("\n");
}
