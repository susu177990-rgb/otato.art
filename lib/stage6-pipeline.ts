import type { Artifact } from "./types";
import { parseEventEpisodeRange } from "./stage-gate";
import { STAGE6_OUTLINE_PREFIX, STAGE4_EVENT_PREFIX } from "./stage-slot-schema";
export type { PipelineProgress } from "./stage5-pipeline";

export interface EventBatch {
  eventNum: number;
  eventLabel: string;
  eventContent: string;
  fromEp: number;
  toEp: number;
}

/**
 * 从 STAGE 4 产物中构建排好序的事件批次列表。
 * 每个批次包含事件编号、标签、内容和对应的集数范围。
 */
export function buildEventBatches(artifacts: Artifact[]): EventBatch[] {
  const events = artifacts
    .filter((a) => a.stage === 4 && a.subKey.startsWith(STAGE4_EVENT_PREFIX))
    .sort((a, b) => {
      const na = parseInt(a.subKey.replace(STAGE4_EVENT_PREFIX, ""), 10) || 0;
      const nb = parseInt(b.subKey.replace(STAGE4_EVENT_PREFIX, ""), 10) || 0;
      return na - nb;
    });

  const batches: EventBatch[] = [];
  for (const ev of events) {
    const range = parseEventEpisodeRange(ev.content);
    if (!range) continue;
    const num = parseInt(ev.subKey.replace(STAGE4_EVENT_PREFIX, ""), 10) || 0;
    batches.push({
      eventNum: num,
      eventLabel: ev.label || `核心事件 ${num}`,
      eventContent: ev.content,
      fromEp: range.from,
      toEp: range.to,
    });
  }
  return batches;
}

/**
 * 从已有的 outline_ep 产物推断下一个未完成的批次索引。
 */
export function findNextBatchIndex(batches: EventBatch[], artifacts: Artifact[]): number {
  const s6 = artifacts.filter(
    (a) => a.stage === 6 && a.subKey.startsWith(STAGE6_OUTLINE_PREFIX)
  );

  /** 仅当该集根大纲正文足够长时才视为已生成（避免空占位「+ 添加第N集」误判为完成） */
  function hasFilledOutline(ep: number): boolean {
    const key = `${STAGE6_OUTLINE_PREFIX}${ep}`;
    const root = s6.find((a) => a.subKey === key && !a.parentKey);
    const t = root?.content?.trim() ?? "";
    if (t.length < 24) return false;
    return /##\s*第\s*\d+\s*集|本集剧情|开头钩子|结尾悬念/u.test(t);
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let allCovered = true;
    for (let ep = batch.fromEp; ep <= batch.toEp; ep++) {
      if (!hasFilledOutline(ep)) {
        allCovered = false;
        break;
      }
    }
    if (!allCovered) return i;
  }
  return batches.length;
}

/**
 * 从上一批最后一集产物中提取「结尾悬念」用于衔接。
 */
export function extractPrevBatchEndHook(
  artifacts: Artifact[],
  prevBatchToEp: number
): string {
  const key = `${STAGE6_OUTLINE_PREFIX}${prevBatchToEp}`;
  const outline = artifacts.find(
    (a) => a.stage === 6 && a.subKey === key && !a.parentKey
  );
  if (!outline?.content?.trim()) return "";

  const hookMatch = outline.content.match(/结尾悬念[：:]\s*([\s\S]*?)(?=\n(?:开头钩子|本集剧情|∆|---|$)|\s*$)/);
  if (hookMatch?.[1]?.trim()) {
    return hookMatch[1].trim().slice(0, 300);
  }

  const text = outline.content.trim();
  return text.slice(Math.max(0, text.length - 200));
}

/**
 * 构建某个事件批次的 user 消息，用于自动流水线发送给 LLM。
 * 直接注入当前事件的完整正文，让 LLM 掌握全部剧情细节。
 */
export function buildOutlineBatchUserMessage(
  batch: EventBatch,
  totalEpisodes: number,
  prevBatchEndHook: string
): string {
  const parts: string[] = [
    `[自动流水线] 请严格服从【工程注入】与侧栏「系列圣经」，`,
    `按 \`Episode Outline Template.md\` 模板，输出第 ${batch.fromEp} 集至第 ${batch.toEp} 集的分集大纲。`,
    `\n\n本批次对应「${batch.eventLabel}」（第${batch.fromEp}集 ~ 第${batch.toEp}集），以下是该事件的完整内容，请严格据此分配各集剧情：`,
    `\n\n---事件开始---\n${batch.eventContent.trim()}\n---事件结束---`,
    `\n\n硬规则：`,
    `① 每集独立 \`## 第N集\` 块，禁止合并集数`,
    `② 全文 @引用，与设定集一字不差`,
    `③「本集剧情」须完整概括本集核心事件与关系变化（至少 3-5 句）`,
    `④ 每集间用 \`---\` 分隔`,
    `⑤ 每集内各字段间须断行`,
    `⑥ 本批所有集的剧情必须完全围绕上述事件展开，禁止提前消耗后续事件的剧情`,
  ];

  if (prevBatchEndHook) {
    parts.push(`\n上一批最后一集（第 ${batch.fromEp - 1} 集）结尾悬念：${prevBatchEndHook}`);
    parts.push(`请确保本批大纲与上一批衔接。`);
  }

  if (batch.fromEp === 1) {
    parts.push(`\n这是全剧开篇，须建立角色关系与核心冲突。`);
  }
  if (batch.toEp === totalEpisodes) {
    parts.push(`\n本批包含最后一集，须完成情绪兑现与结局。`);
  }

  parts.push(`\n仅输出第 ${batch.fromEp}~${batch.toEp} 集，禁止输出其他集。`);
  parts.push(`全剧共 ${totalEpisodes} 集。`);

  return parts.join("");
}

/**
 * 最大已有的大纲集号。
 */
export function maxExistingOutlineEpNum(artifacts: Artifact[]): number {
  let max = 0;
  for (const a of artifacts) {
    if (a.stage !== 6) continue;
    const m = /^outline_ep(\d+)$/.exec(a.subKey);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max;
}
