import { extractAtMentionBodiesFromText } from "./asset-at-mention";
import { compareStage6SubKeys } from "./artifact-mutations";
import type { Artifact, Message, ProjectMeta } from "./types";
import { detectStage } from "./stage-detect";
import { evaluateStageGate, parseEventEpisodeRange } from "./stage-gate";
import { parseTargetEpisodeCount } from "./stage5-pipeline";
import {
  CREATIVE_BRIEF_CONTEXT_CHARS,
  ENGLISH_LOCALE_BRIEF_CONTEXT_CHARS,
  SERIES_BIBLE_CONTEXT_CHARS,
} from "./source-materials";

const STAGE1_OUTLINE_EXCERPT = 500;
const STAGE3_ACT_EXCERPT = 200;
const STAGE4_EVENT_DETAIL_EXCERPT = 1000;

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * 将 STAGE 1-4 产物拼成供工程注入的摘要（约 2000 字以内），
 * 当已进入 STAGE 5+ 且 STAGE 4 已通过时注入。
 */
function buildStage14Summary(artifacts: Artifact[]): string {
  const lines: string[] = [];

  const s1Oneliner = artifacts.find((a) => a.stage === 1 && a.subKey === "oneliner");
  const s1Outline = artifacts.find((a) => a.stage === 1 && a.subKey === "outline");
  if (s1Oneliner?.content?.trim()) {
    lines.push(`[S1 一句话梗概] ${s1Oneliner.content.trim()}`);
  }
  if (s1Outline?.content?.trim()) {
    lines.push(`[S1 完整大纲摘要] ${truncate(s1Outline.content, STAGE1_OUTLINE_EXCERPT)}`);
  }

  const s2Rel = artifacts.find((a) => a.stage === 2 && a.subKey === "relationship");
  const s2Matrix = artifacts.find((a) => a.stage === 2 && a.subKey === "cast_matrix");
  const s2Chars = artifacts.filter(
    (a) => a.stage === 2 && (a.subKey.startsWith("char_") || a.subKey.startsWith("supporting_"))
  );
  if (s2Rel?.content?.trim()) {
    lines.push(`[S2 核心关系定义] ${s2Rel.content.trim()}`);
  }
  if (s2Matrix?.content?.trim()) {
    lines.push(`[S2 人物矩阵] ${s2Matrix.content.trim()}`);
  }
  if (s2Chars.length > 0) {
    lines.push(`[S2 角色列表] ${s2Chars.map((a) => a.label).join("、")}`);
  }

  for (const key of ["act1", "act2", "act3"] as const) {
    const act = artifacts.find((a) => a.stage === 3 && a.subKey === key);
    if (act?.content?.trim()) {
      const label = key === "act1" ? "第一幕" : key === "act2" ? "第二幕" : "第三幕";
      lines.push(`[S3 ${label}摘要] ${truncate(act.content, STAGE3_ACT_EXCERPT)}`);
    }
  }

  const s4Events = artifacts
    .filter((a) => a.stage === 4 && a.subKey.startsWith("event_"))
    .sort((a, b) => a.subKey.localeCompare(b.subKey));
  if (s4Events.length > 0) {
    const eventNames = s4Events.map((a) => {
      const nameMatch = a.content.match(/事件名称[：:]\s*(.+)/);
      const range = parseEventEpisodeRange(a.content);
      const rangeStr = range ? `(${range.from}~${range.to}集)` : "";
      const name = nameMatch ? nameMatch[1].trim() : "";
      return `${a.label}${rangeStr}${name ? `：${name}` : ""}`;
    });
    lines.push(`[S4 核心事件链] ${eventNames.join(" → ")}`);

    for (const ev of s4Events) {
      const range = parseEventEpisodeRange(ev.content);
      const rangeStr = range ? `(${range.from}~${range.to}集)` : "";
      lines.push(`[S4 ${ev.label}详情${rangeStr}]\n${truncate(ev.content, STAGE4_EVENT_DETAIL_EXCERPT)}`);
    }
  }

  if (lines.length === 0) return "";
  return `\n[已确认产物摘要（STAGE 1-4，须严格遵守人物名/时间线/因果关系/事件链）]\n${lines.join("\n")}`;
}

/**
 * 从 STAGE 5 设定集产物中构建资产清单注入（∆分类 + @名称列表）。
 */
function buildSettingsAssetList(artifacts: Artifact[]): string {
  const s5 = artifacts.filter((a) => a.stage === 5);
  if (s5.length === 0) return "";

  const cats = s5.filter((a) => a.subKey.startsWith("cat_"));
  if (cats.length === 0) return "";

  const lines: string[] = [];
  for (const cat of cats) {
    const names = extractAtMentionBodiesFromText(cat.content).map((n) => `@${n}`);
    lines.push(`${cat.label}：${names.join("、") || "（暂无）"}`);
  }

  if (lines.length === 0) return "";
  return `\n[设定集资产清单（STAGE 5，须严格按 @名称引用，不得偏差）]\n${lines.join("\n")}`;
}

/**
 * 从 STAGE 6 分集大纲产物中构建摘要（各集一句概述）。
 * full=true 时输出所有大纲（用于 STAGE 7）；
 * full=false 时仅输出已有的部分大纲（用于 STAGE 6 流水线内部批次衔接）。
 */
function buildOutlineSummary(artifacts: Artifact[], partial = false): string {
  const s6 = artifacts.filter(
    (a) => a.stage === 6 && a.subKey.startsWith("outline_ep") && !a.parentKey
  );
  if (s6.length === 0) return "";
  const lines = s6
    .sort((a, b) => compareStage6SubKeys(a.subKey, b.subKey))
    .map((a) => `[S6 ${a.label}] ${truncate(a.content, 200)}`);
  const tag = partial ? "分集大纲已完成部分（STAGE 6 流水线中）" : "分集大纲摘要（STAGE 6）";
  return `\n[${tag}]\n${lines.join("\n")}`;
}

/**
 * 注入到 /api/chat 的工程侧状态。
 */
export function buildProjectContext(params: {
  messages: Message[];
  artifacts: Artifact[];
  maxApprovedStage: number;
  meta?: ProjectMeta | null;
  creativeBrief?: string;
  /** 立项模式；缺省视为原创 */
  originMode?: "original" | "adaptation";
  /** 改编：原文分析极短摘要（控 token） */
  sourceAnalysisExcerpt?: string;
  /** 项目级系列圣经；完整正文以侧栏为准，此处为节录注入 */
  seriesBible?: string;
  /** 全剧一份英语 Locale 简报；侧栏为准 */
  englishLocaleBrief?: string;
}): string {
  const {
    messages,
    artifacts,
    maxApprovedStage,
    meta,
    creativeBrief,
    originMode,
    sourceAnalysisExcerpt,
    seriesBible,
    englishLocaleBrief,
  } = params;
  const inferred = detectStage(messages);
  const approved = maxApprovedStage ?? 0;

  const parts: string[] = [];

  const mode = originMode ?? "original";
  if (mode === "adaptation") {
    parts.push(`[立项模式] 改编。须与立项策划摘要及原文分析结论一致；勿与改编主线矛盾。`);
    const sa = sourceAnalysisExcerpt?.trim();
    if (sa) {
      parts.push(`[原文分析要点（摘录）] ${sa}`);
    }
  } else {
    parts.push(`[立项模式] 原创。`);
  }

  if (meta && (meta.seriesTitle || meta.episodeCount || meta.targetMarket || meta.dialogueLanguage)) {
    parts.push(
      `[立项] 剧名：${meta.seriesTitle || "未填"}；集数/区间：${meta.episodeCount || "待确认"}；单集约 ${meta.episodeDurationMinutes ?? "?"} 分钟；目标市场：${meta.targetMarket || "待确认"}；台词语言：${meta.dialogueLanguage || "待确认"}。`
    );
  }

  const brief = creativeBrief?.trim();
  if (brief) {
    const excerpt = brief.slice(0, CREATIVE_BRIEF_CONTEXT_CHARS);
    const more = brief.length > CREATIVE_BRIEF_CONTEXT_CHARS;
    parts.push(
      `[立项策划摘要] 须与之一致（以下为前 ${CREATIVE_BRIEF_CONTEXT_CHARS} 字${more ? "，后略" : ""}）：${excerpt}${more ? "…" : ""}`
    );
  }

  parts.push(
    `[工程侧] 主创已在侧栏确认验收至 STAGE ${approved}（0 表示尚未确认）。当前对话最新推断阶段为 STAGE ${inferred || "未判定"}。`
  );

  if (inferred >= 1 && inferred <= 7) {
    const epCount = meta?.episodeCount ? parseTargetEpisodeCount(meta.episodeCount) ?? undefined : undefined;
    const gate = evaluateStageGate(inferred, artifacts, epCount ? { episodeCount: epCount } : undefined);
    if (!gate.ok) {
      parts.push(
        `当前阶段产物未满足验收清单：${gate.items
          .filter((i) => !i.pass)
          .map((i) => i.label)
          .join("、")}。请先补齐或请主创确认后再推进下一阶段交付物。`
      );
    }
  }

  if (approved > 0 && inferred > approved + 1) {
    parts.push(
      `推断阶段已高于「已验收」较多：请勿跳过中间 STAGE 的模板交付物；若主创同意越级，请其在对话中明确说明。`
    );
  }

  const bible = seriesBible?.trim();
  if (bible) {
    const excerpt = bible.slice(0, SERIES_BIBLE_CONTEXT_CHARS);
    const more = bible.length > SERIES_BIBLE_CONTEXT_CHARS;
    parts.push(
      `[系列圣经（节录，须服从）] 与对话冲突时以圣经为准；侧栏为全文真源。以下为前 ${SERIES_BIBLE_CONTEXT_CHARS} 字${more ? "，后略" : ""}：${excerpt}${more ? "…" : ""}`
    );
  } else {
    parts.push(`系列圣经以侧栏「系列圣经」正文为准；与对话冲突时以圣经为准。`);
  }

  if (approved >= 4 && inferred >= 5) {
    parts.push(buildStage14Summary(artifacts));
  }

  if (approved >= 5 && inferred >= 6) {
    parts.push(buildSettingsAssetList(artifacts));
  }

  if (approved >= 5 && inferred === 6) {
    const partial = buildOutlineSummary(artifacts, true);
    if (partial) parts.push(partial);
  }

  if (approved >= 6 && inferred >= 7) {
    parts.push(buildOutlineSummary(artifacts));
  }

  const locale = englishLocaleBrief?.trim();
  if (locale && approved >= 6 && inferred >= 7) {
    const ex = locale.slice(0, ENGLISH_LOCALE_BRIEF_CONTEXT_CHARS);
    const more = locale.length > ENGLISH_LOCALE_BRIEF_CONTEXT_CHARS;
    parts.push(
      `[英语对白 Locale 简报（须服从）] 侧栏全文为准；以下为前 ${ENGLISH_LOCALE_BRIEF_CONTEXT_CHARS} 字${more ? "，后略" : ""}：${ex}${more ? "…" : ""}`
    );
  }

  return parts.join("");
}
