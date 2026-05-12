import { extractAtMentionBodiesFromText } from "./asset-at-mention";
import type { Artifact } from "./types";
import { isStage7EpisodeParsed } from "./stage5-pipeline";

const MIN_ONELINER = 8;
const MIN_ACT = 40;
const MIN_DETAIL = 80;

export interface StageGateItem {
  id: string;
  label: string;
  pass: boolean;
  hint?: string;
  /** 为 true 时不计入总 ok（仅提示） */
  optional?: boolean;
}

export interface StageGateResult {
  ok: boolean;
  items: StageGateItem[];
}

function byStage(artifacts: Artifact[], stage: number): Artifact[] {
  return artifacts.filter((a) => a.stage === stage);
}

function nonEmptyLen(s: string): number {
  return s.trim().length;
}

function countCharSheets(artifacts: Artifact[]): number {
  return artifacts.filter((a) => a.subKey.startsWith("char_")).length;
}

function countSupportingSheets(artifacts: Artifact[]): number {
  return artifacts.filter((a) => a.subKey.startsWith("supporting_")).length;
}

function hasEpisodeLevel(artifacts: Artifact[]): boolean {
  return artifacts.some(
    (a) =>
      /^ep\d+$/.test(a.subKey) ||
      a.subKey === "ep_placeholder" ||
      /^ep\?/.test(a.subKey)
  );
}

/**
 * 从设定集(STAGE 5)产物中提取所有已注册的 @名称。
 */
export function extractRegisteredAssetNames(settingsArtifacts: Artifact[]): Set<string> {
  const names = new Set<string>();
  for (const a of settingsArtifacts) {
    for (const n of extractAtMentionBodiesFromText(a.content)) {
      names.add(n);
    }
  }
  return names;
}

/**
 * 校验内容中的 @引用 是否全部在设定集中已注册。
 * 返回未注册的名称列表。
 */
export function validateAssetReferences(
  allArtifacts: Artifact[],
  targetContent: string
): string[] {
  const s5 = byStage(allArtifacts, 5);
  if (s5.length === 0) return [];
  const registered = extractRegisteredAssetNames(s5);
  if (registered.size === 0) return [];

  const unregistered: string[] = [];
  const seen = new Set<string>();
  for (const name of extractAtMentionBodiesFromText(targetContent)) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (!registered.has(name)) unregistered.push(name);
  }
  return unregistered;
}

/**
 * 从事件产物正文中解析集数范围 `集数范围：第X集 ~ 第Y集`。
 */
export function parseEventEpisodeRange(eventContent: string): { from: number; to: number } | null {
  const m = eventContent.match(/集数范围\**[：:]\s*第\s*(\d+)\s*集\s*[~～\-–—至到]\s*第\s*(\d+)\s*集/);
  if (!m) return null;
  return { from: parseInt(m[1], 10), to: parseInt(m[2], 10) };
}

export interface StageGateMeta {
  episodeCount?: number;
}

/**
 * 从 STAGE 1「本剧角色」产物正文中解析 @名称，按主角/配角分组。
 * 兼容：`- @名`、` - **@名** ——`、无列表符的 `@名`、### 主角、**主角**：等常见变体。
 */
export function parseCastListNames(castListContent: string): {
  leads: string[];
  supporting: string[];
} {
  const leads: string[] = [];
  const supporting: string[] = [];
  const lines = castListContent.split(/\r?\n/);
  let section: "lead" | "supporting" | "unknown" = "unknown";

  /** 小节标题：主角 / 配角（含 markdown 与全角冒号；可无冒号单独成行） */
  const isLeadHeader = (t: string) =>
    /^(?:#{1,4}\s*)?(?:\*\*)?主角(?:一|二|三)?(?:\*\*)?\s*[：:]/.test(t) ||
    /^(?:#{1,4}\s*)?(?:\*\*)?主角(?:一|二|三)?(?:\*\*)?$/.test(t) ||
    /^(?:#{1,4}\s*)?主要角色\s*[：:]/.test(t) ||
    /^(?:#{1,4}\s*)?主要角色$/.test(t) ||
    /^(?:#{1,4}\s*)?核心主角\s*[：:]/.test(t) ||
    /^(?:#{1,4}\s*)?核心主角$/.test(t);
  const isSupportHeader = (t: string) =>
    /^(?:#{1,4}\s*)?(?:\*\*)?配角(?:一|二|三)?(?:\*\*)?\s*[：:]/.test(t) ||
    /^(?:#{1,4}\s*)?(?:\*\*)?配角(?:一|二|三)?(?:\*\*)?$/.test(t) ||
    /^(?:#{1,4}\s*)?重要配角\s*[：:]/.test(t) ||
    /^(?:#{1,4}\s*)?重要配角$/.test(t) ||
    /^(?:#{1,4}\s*)?其他角色\s*[：:]/.test(t) ||
    /^(?:#{1,4}\s*)?其他角色$/.test(t);

  /** 从一行中提取首个 @角色名（去掉末尾 ** 等） */
  function extractAtName(trimmed: string): string | null {
    const m =
      trimmed.match(
        /^(?:[-*•·]|\d+[.)、）])\s*(?:\*\*)?@((?:[^@\n]+?（[^）]+）)|(?:[^\s@*—\-–:：,，;；、]+))(?:\*\*)?/
      ) ?? trimmed.match(/^@((?:[^@\n]+?（[^）]+）)|(?:[^\s@*—\-–:：,，;；、]+))/);
    if (!m) return null;
    const name = m[1].trim().replace(/\*+$/g, "");
    if (!name || /^用一句话|^须列出|^禁止|^示例/i.test(name)) return null;
    return name;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^>\s/.test(trimmed)) continue;

    if (isLeadHeader(trimmed)) {
      section = "lead";
      continue;
    }
    if (isSupportHeader(trimmed)) {
      section = "supporting";
      continue;
    }

    const name = extractAtName(trimmed);
    if (name) {
      if (section === "supporting") supporting.push(name);
      else leads.push(name);
    }
  }

  if (leads.length + supporting.length === 0) {
    const seen = new Set<string>();
    for (const raw of extractAtMentionBodiesFromText(castListContent)) {
      const n = raw.replace(/\*+$/g, "").trim();
      if (!n || seen.has(n)) continue;
      if (/^(角色|名称|[ABCDE])$/i.test(n)) continue;
      seen.add(n);
      leads.push(n);
    }
  }

  return { leads, supporting };
}

function countFilledOutlines(artifacts: Artifact[], totalEp: number): number {
  const s6 = artifacts.filter(
    (a) => a.stage === 6 && a.subKey.startsWith("outline_ep") && !a.parentKey
  );
  let count = 0;
  for (let ep = 1; ep <= totalEp; ep++) {
    const key = `outline_ep${ep}`;
    const root = s6.find((a) => a.subKey === key);
    const t = root?.content?.trim() ?? "";
    if (t.length >= 24 && /##\s*第\s*\d+\s*集|本集剧情|开头钩子|结尾悬念/u.test(t)) {
      count++;
    }
  }
  return count;
}

function countFilledEpisodes(artifacts: Artifact[], totalEp: number): number {
  let count = 0;
  for (let ep = 1; ep <= totalEp; ep++) {
    if (isStage7EpisodeParsed(artifacts, `ep${ep}`)) count++;
  }
  return count;
}

/**
 * 验收「当前阶段」产物是否达到可放行标准。
 * 始终按项目实际规格做精确校验（不再区分 strict/非 strict）。
 */
export function evaluateStageGate(stage: number, artifacts: Artifact[], meta?: StageGateMeta): StageGateResult {
  if (stage < 1 || stage > 7) {
    return { ok: true, items: [] };
  }

  const items: StageGateItem[] = [];
  const a = byStage(artifacts, stage);
  const episodeCount = meta?.episodeCount ?? 0;

  // ─── STAGE 1 ─────────────────────────────────────────────
  if (stage === 1) {
    const oneliner = a.find((x) => x.subKey === "oneliner");
    const detail = a.find((x) => x.subKey === "detail_synopsis");
    const outline = a.find((x) => x.subKey === "outline");
    const castList = a.find((x) => x.subKey === "cast_list");

    const olOk = oneliner && nonEmptyLen(oneliner.content) >= MIN_ONELINER;
    items.push({
      id: "oneliner",
      label: "一句话梗概",
      pass: !!olOk,
      hint: olOk ? undefined : `需至少 ${MIN_ONELINER} 字`,
    });

    const bodyOk =
      (detail && nonEmptyLen(detail.content) >= MIN_DETAIL) ||
      (outline && nonEmptyLen(outline.content) >= MIN_DETAIL);
    items.push({
      id: "body",
      label: "完整大纲",
      pass: !!bodyOk,
      hint: bodyOk ? undefined : `正文不少于 ${MIN_DETAIL} 字`,
    });

    const castNames = castList ? parseCastListNames(castList.content) : { leads: [], supporting: [] };
    const totalNames = castNames.leads.length + castNames.supporting.length;
    items.push({
      id: "cast_list",
      label: `本剧角色清单（已列 ${totalNames} 人）`,
      pass: totalNames >= 2,
      hint: totalNames < 2 ? "需在「本剧角色」段列出至少 2 个 @名称（主角+配角分开）" : undefined,
    });
  }

  // ─── STAGE 2 ─────────────────────────────────────────────
  if (stage === 2) {
    const rel = a.find((x) => x.subKey === "relationship");
    items.push({
      id: "relationship",
      label: "核心关系定义",
      pass: !!(rel && nonEmptyLen(rel.content) >= 20),
      hint: "需有「核心关系定义」小节且非空",
    });

    const matrix = a.find((x) => x.subKey === "cast_matrix");
    items.push({
      id: "cast_matrix",
      label: "人物矩阵总览",
      pass: !!(matrix && nonEmptyLen(matrix.content) >= 20),
      hint: "需有「人物矩阵总览」小节且正文不少于 20 字",
    });

    const s1CastList = artifacts.find((x) => x.stage === 1 && x.subKey === "cast_list");
    if (s1CastList) {
      const { leads, supporting } = parseCastListNames(s1CastList.content);
      const expectedTotal = leads.length + supporting.length;
      const actualChars = countCharSheets(a);
      const actualSupp = countSupportingSheets(a);
      const actualTotal = actualChars + actualSupp;
      items.push({
        id: "cast_count",
        label: `角色小传完整性（需 ${expectedTotal}，已有 ${actualTotal}）`,
        pass: actualTotal >= expectedTotal,
        hint: actualTotal < expectedTotal
          ? `STAGE 1 角色清单列出 ${expectedTotal} 个角色，但小传只有 ${actualTotal} 个`
          : undefined,
      });
    } else {
      const nChar = countCharSheets(a);
      const nSupp = countSupportingSheets(a);
      const castOk = (nChar + nSupp) >= 2;
      items.push({
        id: "cast_count",
        label: `角色小传（已有 ${nChar + nSupp}）`,
        pass: castOk,
        hint: castOk ? undefined : "无 STAGE 1 角色清单可对照，至少需要 2 个角色小传",
      });
    }
  }

  // ─── STAGE 3 ─────────────────────────────────────────────
  if (stage === 3) {
    for (const key of ["act1", "act2", "act3"] as const) {
      const sec = a.find((x) => x.subKey === key);
      const ok = !!(sec && nonEmptyLen(sec.content) >= MIN_ACT);
      items.push({
        id: key,
        label: key === "act1" ? "第一幕" : key === "act2" ? "第二幕" : "第三幕",
        pass: ok,
        hint: ok ? undefined : `正文不少于 ${MIN_ACT} 字`,
      });
    }
  }

  // ─── STAGE 4 ─────────────────────────────────────────────
  if (stage === 4) {
    const events = a.filter((x) => /^event_/.test(x.subKey));

    if (episodeCount > 0) {
      const minEvents = Math.ceil(episodeCount / 15);
      items.push({
        id: "event_count",
        label: `核心事件数量（需 ≥${minEvents}，已有 ${events.length}）`,
        pass: events.length >= minEvents,
        hint: events.length < minEvents
          ? `${episodeCount} 集至少需 ${minEvents} 个事件（每事件最多 15 集），当前仅 ${events.length}`
          : undefined,
      });
    } else {
      items.push({
        id: "event_count",
        label: `核心事件（已有 ${events.length}）`,
        pass: events.length >= 1,
        hint: events.length < 1 ? "需有至少 1 个核心事件" : undefined,
      });
    }

    const sorted = events
      .map((e) => ({ sub: e.subKey, range: parseEventEpisodeRange(e.content) }))
      .filter((x) => x.range !== null)
      .sort((a, b) => a.range!.from - b.range!.from);

    if (sorted.length > 0) {
      let continuous = true;
      let hintMsg = "";
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].range!;
        const cur = sorted[i].range!;
        if (prev.to + 1 !== cur.from) {
          continuous = false;
          hintMsg = `事件 ${sorted[i - 1].sub} 结束于第${prev.to}集，事件 ${sorted[i].sub} 起始于第${cur.from}集，存在间隔或重叠`;
          break;
        }
      }
      const first = sorted[0].range!.from;
      const last = sorted[sorted.length - 1].range!.to;
      if (first !== 1) {
        continuous = false;
        hintMsg = `首个事件起始于第${first}集，不是第1集`;
      }
      if (continuous && episodeCount > 0 && last !== episodeCount) {
        continuous = false;
        hintMsg = `事件集数范围覆盖到第${last}集，但总集数为${episodeCount}`;
      }
      items.push({
        id: "episode_range",
        label: "集数范围连续覆盖",
        pass: continuous,
        hint: continuous ? undefined : hintMsg,
      });
    } else if (events.length > 0) {
      items.push({
        id: "episode_range",
        label: "集数范围连续覆盖",
        pass: false,
        hint: "未检测到任何事件的「集数范围：第X集 ~ 第Y集」标注",
      });
    }

    const chain = a.find((x) => x.subKey === "chain_check");
    items.push({
      id: "chain_check",
      label: "事件链总检",
      pass: !!(chain && nonEmptyLen(chain.content) >= 10),
      hint: "建议补充「事件链总检」以便串联",
      optional: true,
    });
  }

  // ─── STAGE 5 ─────────────────────────────────────────────
  if (stage === 5) {
    const catChars = a.find((x) => x.subKey === "cat_characters");
    const catItems = a.find((x) => x.subKey === "cat_items");
    const catScenes = a.find((x) => x.subKey === "cat_scenes");

    items.push({
      id: "cat_characters",
      label: "∆人物分类",
      pass: !!(catChars && nonEmptyLen(catChars.content) >= 10),
      hint: "需有「∆人物」分类且内容非空",
    });
    items.push({
      id: "cat_items",
      label: "∆物品分类",
      pass: !!(catItems && nonEmptyLen(catItems.content) >= 10),
      hint: "需有「∆物品」分类且内容非空",
    });
    items.push({
      id: "cat_scenes",
      label: "∆场景分类",
      pass: !!(catScenes && nonEmptyLen(catScenes.content) >= 10),
      hint: "需有「∆场景」分类且内容非空",
    });

    const registered = extractRegisteredAssetNames(a);
    items.push({
      id: "settings_asset",
      label: `@资产定义（已有 ${registered.size} 个）`,
      pass: registered.size > 0,
      hint: registered.size === 0 ? "需在设定集中定义至少 1 个 @资产名称" : undefined,
    });
  }

  // ─── STAGE 6 ─────────────────────────────────────────────
  if (stage === 6) {
    if (episodeCount > 0) {
      const filled = countFilledOutlines(artifacts, episodeCount);
      items.push({
        id: "outline_count",
        label: `分集大纲完整性（需 ${episodeCount} 集，已有 ${filled} 集）`,
        pass: filled >= episodeCount,
        hint: filled < episodeCount
          ? `全部 ${episodeCount} 集大纲须完成，当前仅 ${filled} 集`
          : undefined,
      });
    } else {
      const hasOutline = a.some((x) => x.subKey.startsWith("outline_ep"));
      items.push({
        id: "outline_count",
        label: "分集大纲",
        pass: hasOutline,
        hint: hasOutline ? undefined : "需解析出至少一集大纲产物（无法获取总集数以精确校验）",
      });
    }

    const allContent = a.map((x) => x.content).join("\n");
    const unregistered = validateAssetReferences(artifacts, allContent);
    items.push({
      id: "asset_check",
      label: "资产引用校验",
      pass: unregistered.length === 0,
      hint: unregistered.length > 0
        ? `以下 @引用 未在设定集中注册：${unregistered.join("、")}`
        : undefined,
      optional: true,
    });
  }

  // ─── STAGE 7 ─────────────────────────────────────────────
  if (stage === 7) {
    if (episodeCount > 0) {
      const filled = countFilledEpisodes(artifacts, episodeCount);
      items.push({
        id: "episode_count",
        label: `分集剧本完整性（需 ${episodeCount} 集，已有 ${filled} 集）`,
        pass: filled >= episodeCount,
        hint: filled < episodeCount
          ? `全部 ${episodeCount} 集剧本须完成，当前仅 ${filled} 集`
          : undefined,
      });
    } else {
      items.push({
        id: "episode_count",
        label: "分集剧本",
        pass: hasEpisodeLevel(a),
        hint: "需解析出至少一集产物（无法获取总集数以精确校验）",
      });
    }

    const allContent = a.map((x) => x.content).join("\n");
    const unregistered = validateAssetReferences(artifacts, allContent);
    items.push({
      id: "asset_check",
      label: "资产引用校验",
      pass: unregistered.length === 0,
      hint: unregistered.length > 0
        ? `以下 @引用 未在设定集中注册：${unregistered.join("、")}`
        : undefined,
      optional: true,
    });
  }

  const ok = items.every((i) => i.optional || i.pass);
  return { ok, items };
}
