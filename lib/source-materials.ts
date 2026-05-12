import type { SourceMaterial } from "./types";

/**
 * 项目内所有素材总字数上限（按字符计）。
 * 与 `analyze-source` 的 `ANALYZE_INPUT_MAX` 对齐思路：需存得下才可能整段参与分析。
 * 超大文本会占用内存与 JSON 体积；分析时仍受所选模型上下文窗口约束。
 */
export const SOURCE_MATERIALS_MAX_CHARS = 1_000_000;

/** 策划首轮注入：每份素材截取字数 */
export const PLANNING_EXCERPT_PER_MATERIAL = 4000;

/** creativeBrief 注入主对话上下文时的前缀摘要长度 */
export const CREATIVE_BRIEF_CONTEXT_CHARS = 300;

/** seriesBible 注入主对话上下文时的前缀摘要长度 */
export const SERIES_BIBLE_CONTEXT_CHARS = 400;

/** 英语 Locale 简报注入 STAGE 7 工程上下文时的前缀摘要长度 */
export const ENGLISH_LOCALE_BRIEF_CONTEXT_CHARS = 450;

/** 改编：原文分析注入编剧室上下文的摘录长度 */
export const SOURCE_ANALYSIS_CONTEXT_CHARS = 400;

/** 改编讨论 / 规划师注入：原文分析摘录上限 */
export const ADAPTATION_SOURCE_ANALYSIS_INJECT_CHARS = 12_000;

/** 改编规划师：改编讨论线程摘录上限 */
export const ADAPTATION_MESSAGES_EXCERPT_CHARS = 8_000;

/** 改编规划师：策划对话摘录上限 */
export const ADAPTATION_PLANNING_EXCERPT_CHARS = 12_000;

/** 改编规划师：注入「改编讨论」全线程时允许更长摘录（优先带入上一步结论） */
export const ADAPTATION_DISCUSSION_FOR_PLANNER_CHARS = 56_000;

export function totalSourceChars(materials: SourceMaterial[]): number {
  return materials.reduce((n, m) => n + (m.text?.length ?? 0), 0);
}

export function assertSourceMaterialsWithinLimit(
  materials: SourceMaterial[],
  nextTextLen: number,
  replaceId?: string
): { ok: boolean; total: number } {
  let total = totalSourceChars(materials);
  if (replaceId) {
    const prev = materials.find((m) => m.id === replaceId);
    if (prev) total -= prev.text.length;
  }
  total += nextTextLen;
  return { ok: total <= SOURCE_MATERIALS_MAX_CHARS, total };
}
