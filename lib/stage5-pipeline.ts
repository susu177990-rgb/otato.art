import type { Artifact } from "./types";

/**
 * 从自由文本 episodeCount（如 "40"、"30~60"、"30-60 集"）解析为确定数字。
 * 区间取上界；无法解析返回 null。
 */
export function parseTargetEpisodeCount(raw: string): number | null {
  const s = raw.replace(/\s+/g, "").replace(/集$/u, "");
  const rangeM = s.match(/(\d+)[~～\-–—](\d+)/);
  if (rangeM) {
    const upper = parseInt(rangeM[2], 10);
    return Number.isFinite(upper) && upper > 0 ? upper : null;
  }
  const single = s.match(/(\d+)/);
  if (single) {
    const n = parseInt(single[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** 判定某一集是否已被流水线视为「写完了」（兼容新 epN+epN.body 与旧 场次/幕） */
export function isStage7EpisodeParsed(artifacts: Artifact[], epKey: string): boolean {
  const root = artifacts.find((a) => a.stage === 7 && a.subKey === epKey && !a.parentKey);
  const body = artifacts.find((a) => a.stage === 7 && a.subKey === `${epKey}.body`);
  const rootLen = (root?.content ?? "").trim().length;
  const bodyLen = (body?.content ?? "").trim().length;
  /** 新格式：有独立正文产物且足够长 */
  if (bodyLen >= 80) return true;
  /** 旧格式：有场次树 */
  const hasScenes = artifacts.some(
    (a) => a.stage === 7 && a.parentKey === epKey && /^ep\d+\.scene\d+$/u.test(a.subKey)
  );
  if (hasScenes && rootLen >= 20) return true;
  /** 旧格式或整段落在 epN：概述区足够长 */
  if (rootLen >= 40) return true;
  return false;
}

/** 从 artifacts 中找到已有的、有实际内容的最大集号（ep1, ep2, …） */
export function maxExistingEpisodeNum(artifacts: Artifact[]): number {
  let max = 0;
  const nums = new Set<number>();
  for (const a of artifacts) {
    if (a.stage !== 7) continue;
    const rm = /^ep(\d+)$/.exec(a.subKey);
    const bm = /^ep(\d+)\.body$/.exec(a.subKey);
    if (rm) nums.add(parseInt(rm[1], 10) || 0);
    if (bm) nums.add(parseInt(bm[1], 10) || 0);
  }
  for (const n of nums) {
    if (n > 0 && isStage7EpisodeParsed(artifacts, `ep${n}`)) {
      max = Math.max(max, n);
    }
  }
  return max;
}

function extractOverviewField(text: string, label: string): string {
  const re = new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`, "u");
  const m = text.match(re);
  return (m?.[1] ?? "").trim();
}

/** 从上一集产物中提取衔接信息（优先新格式概述字段，其次旧 hook / 全文概述） */
export function extractPrevEpisodeSummary(
  artifacts: Artifact[],
  epNum: number
): string {
  const epKey = `ep${epNum}`;
  const overview = artifacts.find(
    (a) => a.stage === 7 && a.subKey === epKey && !a.parentKey
  );
  const text = overview?.content?.trim() ?? "";

  const core = extractOverviewField(text, "本集剧情核心");
  const mainHook = extractOverviewField(text, "本集主钩子");
  const endType = extractOverviewField(text, "本集集尾卡点类型");

  if (core || mainHook || endType) {
    const bits: string[] = [];
    if (core) bits.push(`剧情核心：${core.slice(0, 220)}`);
    if (mainHook) bits.push(`主钩子：${mainHook.slice(0, 220)}`);
    if (endType) bits.push(`集尾卡点类型：${endType.slice(0, 120)}`);
    return `上一集（第${epNum}集）衔接参考：` + bits.join("；");
  }

  const hook = artifacts.find(
    (a) => a.stage === 7 && a.subKey === `${epKey}.hook`
  );
  if (hook?.content?.trim()) {
    return `上一集（第${epNum}集）集尾卡点：${hook.content.trim().slice(0, 300)}`;
  }
  if (text) {
    return `上一集（第${epNum}集）概述：${text.slice(0, 300)}${text.length > 300 ? "…" : ""}`;
  }
  return "";
}

/** 构建自动流水线里「写第 N 集」的 user 消息 */
export function buildEpisodeUserMessage(
  epNum: number,
  totalEpisodes: number,
  prevSummary: string
): string {
  const parts: string[] = [
    `[自动流水线] 请严格服从【工程注入】与侧栏「系列圣经」，`,
    `按 \`agent/templates/Episode Development Script Template.md\` 模板，`,
    `输出 **第 ${epNum} 集**（全剧共 ${totalEpisodes} 集）的完整分集剧本。`,
    `结构必须是：\`## 第${epNum}集：《标题》\` + 概述字段（本集剧情核心、本集情绪走向、时长、∆场景/∆出场人物/∆出场物品、本集主钩子、本集集尾卡点类型）+ 分隔线 \`---\` + \`正文：\` + **单块时间线正文**。`,
    `**禁止**再写「场次」「幕」「#### 幕」；禁止镜头编号、景别、机位、时间段标签。`,
    `正文按先后顺序写满全集：动作、表情、事件推进、对白全部融在连续叙事里；结尾用台词/动作/表情落在集尾卡点。`,
    `**代词硬规则**：禁止他/她/它等指向不清的代词，重复 **@主称谓（中文名）** 全串或全名。`,
    `**台词硬规则**：本地化 **英语**，句末括号 **（中文翻译）**；每句台词前用括号写情绪/表演/状态；并标明 **@角色主称谓（中文名）**（与 STAGE 5 逐字一致）。`,
    `若工程注入含 **[英语对白 Locale 简报（须服从）]**，英语对白语体须与其一致，禁止 Chinglish。`,
    `概述区与正文中，每次提到场景/人物/物品必须用 **@主称谓（中文名）** 全串（全角括号），与 STAGE 5 设定集完全一致。`,
    `**仅输出这一集，禁止输出其他集。**`,
  ];
  if (prevSummary) {
    parts.push(`\n${prevSummary}`);
    parts.push(`请确保本集与上一集剧情衔接。`);
  }
  if (epNum === 1) {
    parts.push(`\n这是全剧第一集，须建立关系钩子与主冲突。`);
  }
  if (epNum === totalEpisodes) {
    parts.push(`\n这是最后一集，须完成情绪兑现与结局。`);
  }
  parts.push(
    `\n须严格遵守工程注入中 [已确认产物摘要] 里的人物名、时间线、因果关系与事件链。`
  );
  return parts.join("");
}

export interface PipelineProgress {
  current: number;
  total: number;
  status: "running" | "paused" | "done" | "error";
  errorMessage?: string;
  /** 分集剧本流水线 vs 分集大纲流水线；用于「继续」恢复时与 viewStage 解耦 */
  kind?: "episode" | "outline";
}
