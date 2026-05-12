import { forEachAssetMention } from "./asset-at-mention";
import type { Artifact } from "./types";
import { compareStage6SubKeys } from "./artifact-mutations";
import { stripThinkingBlocks } from "./strip-thinking";

/**
 * 按 `## 标题` 等切块。**正文从标题行结束之后开始**，不包含标题行本身。
 * 旧实现用「上一标题起始下标」截到「下一标题起始」，会把标题行重复进 body，
 * 且在文首有引言时把引言错误算进第一幕正文，导致第一幕与标题错位或验收失败。
 */
function splitBySections(
  content: string,
  level: "#" | "##" | "###" | "####"
): { heading: string; body: string }[] {
  const re = new RegExp(`(?:^|\\n)(${level}\\s+[^\\n]+)`, "g");
  const hits: { index: number; heading: string; fullLen: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    hits.push({
      index: m.index,
      heading: m[1].trim(),
      fullLen: m[0].length,
    });
  }
  const sections: { heading: string; body: string }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const bodyStart = hits[i].index + hits[i].fullLen;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : content.length;
    sections.push({
      heading: hits[i].heading,
      body: content.slice(bodyStart, bodyEnd).trim(),
    });
  }
  return sections;
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

/** 将「一」「十一」「21」等转为正整数；失败返回 0 */
function cnOrdinalToNum(ord: string): number {
  const o = ord.trim();
  if (/^\d+$/.test(o)) {
    const n = parseInt(o, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const d: Record<string, number> = {
    〇: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (o === "十") return 10;
  if (o.length === 1 && d[o] != null) return d[o];
  if (o.startsWith("十") && o.length === 2) return 10 + (d[o[1]] ?? 0);
  const tensUnit = o.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/);
  if (tensUnit) {
    const tens = (d[tensUnit[1]] ?? 0) * 10;
    return tensUnit[2] ? tens + (d[tensUnit[2]] ?? 0) : tens;
  }
  return 0;
}

function now(): string {
  return new Date().toISOString();
}

/** 是否像「模板交付物」（区别于纯流程话术、总控提示等） */
export function looksLikeTemplateDeliverable(content: string): boolean {
  const c = stripThinkingBlocks(content);
  if (
    /(?:^|\n)##\s*(?:第\s*\d+\s*集|第\s*[一二三四五六七八九十百千]+\s*集|第\s*\[集数\]\s*集|一句话梗概|完整大纲|详细剧情梗概)/m.test(
      c
    )
  )
    return true;
  /** 常见模型用 ### 或未加 ## 的加粗小节标题 */
  if (/(?:^|\n)#{3,4}\s*(?:一句话梗概|完整大纲|详细剧情梗概)\s*$/m.test(c)) return true;
  if (/(?:^|\n)\s*\*{1,2}\s*一句话梗概\s*\*{0,2}\s*(?:[：:]|\s*$)/m.test(c)) return true;
  if (/(?:^|\n)##\s*角色[一二三四五六七八九十\d]+[：:]/m.test(c)) return true;
  if (/(?:^|\n)##\s*(?:主角|配角)[一二三四五六七八九十\d]+(?:[：:]|$)/m.test(c)) return true;
  if (/(?:^|\n)##\s*关键配角[：:]/m.test(c)) return true;
  if (/(?:^|\n)##\s*核心关系定义/m.test(c)) return true;
  if (/(?:^|\n)##\s*人物矩阵总览/m.test(c)) return true;
  if (/(?:^|\n)##\s*第[一二三]幕(?:\s|$|[：:（(])/m.test(c)) return true;
  if (/(?:^|\n)##\s*核心事件\s*\d/m.test(c)) return true;
  if (/(?:^|\n)##\s*事件链总检/m.test(c)) return true;
  if (/(?:^|\n)###\s*场次\s*\d+/m.test(c)) return true;
  if (/(?:^|\n)####\s*幕\s*\d+/m.test(c)) return true;
  /** STAGE 7 新格式：概述字段 + 正文块 */
  if (/(?:^|\n)\s*本集剧情核心\s*[：:]/m.test(c)) return true;
  if (/(?:^|\n)\s*∆出场人物\s*[：:]/m.test(c)) return true;
  if (/(?:^|\n)\s*∆出场物品\s*[：:]/m.test(c)) return true;
  if (/(?:^|\n)---\s*\n\s*正文\s*[：:]/m.test(c)) return true;
  // STAGE 5 设定集
  if (/(?:^|\n)##?\s*∆(?:人物|物品|场景)/m.test(c)) return true;
  if (/(?:^|\n)##?\s*设定集/m.test(c)) return true;
  // STAGE 6 分集大纲（旧 ### 格式 + 新行内键值对格式）
  if (/(?:^|\n)###?\s*(?:开头钩子|本集概述|本集剧情|结尾悬念)/m.test(c)) return true;
  if (/(?:^|\n)(?:开头钩子|本集剧情|本集概述|结尾悬念)[：:]/m.test(c)) return true;
  if (/(?:^|\n)##?\s*分集大纲/m.test(c)) return true;
  const h2 = c.match(/^##\s+\S[^\n]*/gm) ?? [];
  if (h2.length >= 2) return true;
  /** 短回复只有一句梗概时，右侧仍需落产物 */
  if (/(?:^|\n)\s*一句话梗概\s*[：:]/.test(c)) return true;
  if (/(?:^|\n)\s*#{1,3}\s*一句话梗概/.test(c)) return true;
  if (/(?:^|\n)\s*【\s*一句话梗概\s*】/.test(c)) return true;
  return false;
}

/** 将 STAGE 1 常见「### 一句话梗概」等提升为 ##，便于 splitBySections；不改动正文句子。 */
function normalizeStage1Markdown(c: string): string {
  return c.replace(/^(\s*)#{3,4}\s*(一句话梗概|完整大纲|详细剧情梗概)\s*$/gim, "## $2");
}

/** 从全文宽松提取「一句话梗概」正文（标题与内容分行、加粗标题、无冒号等） */
function extractOnelinerLoose(content: string): string | null {
  const c = content;
  const blocks: RegExp[] = [
    /(?:^|\n)\s*(?:#{1,4}\s*|\*{1,2}\s*)?一句话梗概(?:\s*\*{0,2})?\s*[：:]\s*([^\n]+)/u,
    /(?:^|\n)\s*【\s*一句话梗概\s*】\s*[：:：\-—]?\s*([^\n]+)/u,
    /(?:^|\n)\s*「\s*一句话梗概\s*」\s*[：:：\-—]?\s*([^\n]+)/u,
    /(?:^|\n)\s*(?:#{1,4}\s*|\*{1,2}\s*)?一句话梗概(?:\s*\*{0,2})?\s*\r?\n+\s*([\s\S]+?)(?=\n\s*#{1,6}\s+\S|\n{3,}|$)/iu,
  ];
  for (const re of blocks) {
    const m = c.match(re);
    const cap = m?.[1]?.trim();
    if (cap && cap.length > 0 && !/^[\[【（]?用一句话/i.test(cap)) {
      return cap.length > 4000 ? cap.slice(0, 4000) : cap;
    }
  }
  return null;
}

function extractStage1(content: string): Artifact[] {
  const results: Artifact[] = [];
  const normalized = normalizeStage1Markdown(content);
  const sections = splitBySections(normalized, "##");

  const oneliner = sections.find((s) => /一句话梗概/.test(s.heading));
  if (oneliner) {
    let body = oneliner.body.trim();
    /** 模型只贴了模板占位、真实一句在段后时，用宽松规则覆盖 */
    if (!body || /^[\[【「]?用一句话/i.test(body)) {
      const loose = extractOnelinerLoose(normalized);
      if (loose) body = loose;
    }
    if (body) {
      results.push({
        stage: 1,
        subKey: "oneliner",
        label: "一句话梗概",
        content: body.length > 4000 ? body.slice(0, 4000) : body,
        updatedAt: now(),
      });
    }
  }

  const castListSection = sections.find((s) => /本剧角色/.test(s.heading));
  if (castListSection?.body?.trim()) {
    results.push({
      stage: 1,
      subKey: "cast_list",
      label: "本剧角色",
      content: castListSection.body.trim(),
      updatedAt: now(),
    });
  }

  const detailSynopsis = sections.find((s) => /详细剧情梗概/.test(s.heading));
  const outlineSections = sections.filter(
    (s) =>
      !/一句话梗概/.test(s.heading) &&
      !/详细剧情梗概/.test(s.heading) &&
      !/本剧角色/.test(s.heading)
  );
  const outlineParts: string[] = [];
  if (detailSynopsis?.body?.trim()) outlineParts.push(detailSynopsis.body.trim());
  for (const s of outlineSections) {
    if (s.body?.trim()) outlineParts.push(s.body.trim());
  }
  const outlineCombined = outlineParts.join("\n\n").trim();
  if (outlineCombined.length > 20) {
    results.push({
      stage: 1,
      subKey: "outline",
      label: "完整大纲",
      content: outlineCombined,
      updatedAt: now(),
    });
  }

  if (results.length === 0) {
    /** 兼容 **一句话梗概**、### 标题、标题与正文分行、无冒号同行等 */
    const loose = extractOnelinerLoose(normalized);
    if (loose) {
      results.push({
        stage: 1,
        subKey: "oneliner",
        label: "一句话梗概",
        content: loose,
        updatedAt: now(),
      });
    }
  }

  if (results.length === 0) {
    const detail = normalized.match(
      /(?:^|\n)\s*(?:#{1,3}\s*)?详细剧情梗概\s*[：:]\s*([\s\S]+?)(?=\n\s*(?:#{1,2}\s|一句话|$))/i
    );
    if (detail && detail[1].trim().length > 10) {
      results.push({
        stage: 1,
        subKey: "outline",
        label: "完整大纲",
        content: detail[1].trim(),
        updatedAt: now(),
      });
    }
  }

  return results;
}

/**
 * 模型常见坏格式：英文句号/文字与 `##` 粘在同行；小节标题忘了写 `##`；「关键配角」用括号说明而非「：姓名」。
 * 先规范化再按 ## 切块，避免整块落库失败。
 */
function normalizeStage2Markdown(c: string): string {
  let s = c.replace(/([^\s\r\n#])(##\s+)/g, "$1\n$2");
  s = s.replace(/^(\s*)(?!##\s)(人物矩阵总览)\s*$/m, "## $2");
  s = s.replace(/^(\s*)(?!##\s)(角色[一二三四五六七八九十\d]+[：:][^\n]*)$/gm, "## $2");
  s = s.replace(/^(\s*)(?!##\s)((?:主角|配角)[一二三四五六七八九十\d]+[：:][^\n]*)$/gm, "## $2");
  s = s.replace(/^(\s*)(?!##\s)(主角[一二三四五六七八九十\d]+)\s*$/gm, "## $2");
  s = s.replace(/^(\s*)(?!##\s)(配角[一二三四五六七八九十\d]+[：:][^\n]*)$/gm, "## $2");
  s = s.replace(/^(\s*)(?!##\s)(配角[一二三四五六七八九十\d]+)\s*$/gm, "## $2");
  s = s.replace(/^(\s*)(?!##\s)(关键配角[（(][^\n]+[）)])\s*$/m, "## $2");
  return s;
}

/** 「Arthur Sterling (亚瑟·斯特林)\n人设：…」式配角块（无 ## 小节） */
function extractSupportingParagraphBlocks(body: string): Artifact[] {
  const out: Artifact[] = [];
  const seen = new Set<string>();
  const chunks = body.split(/\r?\n(?=[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*\([^)]{1,40}\)\s*$)/m);
  for (const chunk of chunks) {
    const t = chunk.trim();
    if (!t) continue;
    const m = t.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\(([^)]+)\)\s*\r?\n([\s\S]+)/);
    if (!m) continue;
    const en = m[1].trim();
    const subKey = `supporting_${slugify(en)}`;
    if (seen.has(subKey)) continue;
    seen.add(subKey);
    out.push({
      stage: 2,
      subKey,
      label: `配角：${en}`,
      content: m[3].trim(),
      updatedAt: now(),
    });
  }
  return out;
}

function extractStage2(content: string): Artifact[] {
  const normalized = normalizeStage2Markdown(content);
  const results: Artifact[] = [];
  const sections = splitBySections(normalized, "##");

  for (const sec of sections) {
    const h = sec.heading.replace(/^#+\s*/, "").trim();

    if (/人物矩阵总览/.test(h)) {
      results.push({
        stage: 2,
        subKey: "cast_matrix",
        label: "人物矩阵总览",
        content: sec.body,
        updatedAt: now(),
      });
      continue;
    }

    const leadMatch = h.match(/^(?:角色|主角)([一二三四五六七八九十\d]+)(?:[：:]\s*(.+))?$/);
    if (leadMatch) {
      const ordinalRaw = leadMatch[1];
      const idx = cnOrdinalToNum(ordinalRaw) || 1;
      const rest = (leadMatch[2] ?? "").trim();
      const name = rest.replace(/[（(].+[)）]/u, "").trim();
      const subKey = name ? `char_${slugify(name)}` : `char_lead_${idx}`;
      const label = name ? `主角${ordinalRaw}：${name}` : `主角${ordinalRaw}`;
      if (!results.some((r) => r.subKey === subKey)) {
        results.push({
          stage: 2,
          subKey,
          label,
          content: sec.body,
          updatedAt: now(),
        });
      }
      continue;
    }

    const supNumMatch = h.match(/^配角([一二三四五六七八九十\d]+)(?:[：:]\s*(.+))?$/);
    if (supNumMatch) {
      const ordinalRaw = supNumMatch[1];
      const idx = cnOrdinalToNum(ordinalRaw) || 1;
      const rest = (supNumMatch[2] ?? "").trim();
      const name = rest.replace(/[（(].+[)）]/u, "").trim();
      const subKey = `supporting_p${idx}`;
      const label = name ? `配角${ordinalRaw}：${name}` : `配角${ordinalRaw}`;
      if (!results.some((r) => r.subKey === subKey)) {
        results.push({
          stage: 2,
          subKey,
          label,
          content: sec.body,
          updatedAt: now(),
        });
      }
      continue;
    }

    const supportMatch = h.match(/关键配角[：:]\s*(.+)/);
    if (supportMatch) {
      const name = supportMatch[1].trim().replace(/[（(].+[)）]/, "").trim();
      results.push({
        stage: 2,
        subKey: `supporting_${slugify(name)}`,
        label: `配角：${name}`,
        content: sec.body,
        updatedAt: now(),
      });
      continue;
    }

    if (/关键配角/.test(h) && /[（(]/.test(h)) {
      for (const a of extractSupportingParagraphBlocks(sec.body)) {
        if (!results.some((r) => r.subKey === a.subKey)) results.push(a);
      }
      continue;
    }

    if (/核心关系定义/.test(h)) {
      results.push({
        stage: 2,
        subKey: "relationship",
        label: "核心关系定义",
        content: sec.body,
        updatedAt: now(),
      });
      continue;
    }
  }

  if (!results.some((r) => r.subKey === "relationship")) {
    for (const level of ["###", "####"] as const) {
      for (const sec of splitBySections(normalized, level)) {
        if (/核心关系定义/.test(sec.heading)) {
          results.push({
            stage: 2,
            subKey: "relationship",
            label: "核心关系定义",
            content: sec.body.trim(),
            updatedAt: now(),
          });
          break;
        }
      }
      if (results.some((r) => r.subKey === "relationship")) break;
    }
  }

  if (!results.some((r) => r.subKey === "relationship")) {
    const rel = extractRelationshipBlockFallback(normalized);
    if (rel) results.push(rel);
  }

  const haveSupport = results.some((r) => r.subKey.startsWith("supporting_"));
  if (!haveSupport) {
    for (const a of extractSupportingParagraphBlocks(normalized)) {
      if (!results.some((r) => r.subKey === a.subKey)) results.push(a);
    }
  }

  return results;
}

/** 当 splitBySections 未单独切出「核心关系定义」时（例如模型仅用 ###、或标题与正文格式异常），用手动边界再抓一次 */
function extractRelationshipBlockFallback(content: string): Artifact | null {
  const reHead = /(?:^|\r?\n)(#{1,4}\s*[^\r\n]*核心关系定义[^\r\n]*)\r?\n/;
  const m = reHead.exec(content);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = content.slice(start);
  const next = rest.search(/\r?\n#{1,4}\s/);
  const body = (next >= 0 ? rest.slice(0, next) : rest).trim();
  if (!body) return null;
  return {
    stage: 2,
    subKey: "relationship",
    label: "核心关系定义",
    content: body,
    updatedAt: now(),
  };
}

/** STAGE 3：粘连 `。##`、误用 `### 第一幕` 作幕标题（应为 `##`） */
function normalizeStage3Markdown(c: string): string {
  let s = c.replace(/\ufeff/g, "");
  s = s.replace(/([^\s\r\n#])(##\s+)/g, "$1\n$2");
  s = s.replace(
    /^###\s*((?:第[一二三四五六七八九十]+幕)(?:[：:][^\n]*)?)\s*$/gm,
    "## $1"
  );
  return s;
}

function extractStage3(content: string): Artifact[] {
  const results: Artifact[] = [];
  const sections = splitBySections(normalizeStage3Markdown(content), "##");

  const actMap: [RegExp, string, string][] = [
    [/第一幕/, "act1", "第一幕"],
    [/第二幕/, "act2", "第二幕"],
    [/第三幕/, "act3", "第三幕"],
    [/三幕式总检|总检/, "summary", "三幕式总检"],
  ];

  for (const [re, subKey, label] of actMap) {
    const sec = sections.find((s) => re.test(s.heading));
    if (sec) {
      results.push({ stage: 3, subKey, label, content: sec.body, updatedAt: now() });
    }
  }

  return results;
}

/** 从 `## 核心事件 1` / `核心事件一` / `核心事件1` 等标题解析阿拉伯序号；非事件标题返回 null */
function parseCoreEventIndexFromHeading(heading: string): number | null {
  const h = heading.replace(/^#+\s*/, "").trim();
  if (/事件链总检/.test(h)) return null;
  if (/核心事件\s*[（(]?\s*续/.test(h)) return null;
  const m = h.match(/核心事件\s*[：:]?\s*(\d+|[一二三四五六七八九十百千]+)/);
  if (!m) return null;
  const raw = m[1];
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = cnOrdinalToNum(raw);
  return n > 0 ? n : null;
}

/** STAGE 4：`### 核心事件 N` 误级、粘连、## 后缺空格等 */
function normalizeStage4Markdown(c: string): string {
  let s = c.replace(/\ufeff/g, "");
  s = s.replace(/([^\s\r\n#])(##\s+)/g, "$1\n$2");
  s = s.replace(/^###\s*(核心事件[^\n]+)\s*$/gm, "## $1");
  s = s.replace(/^##(?![#\s])([^\n]+)$/gm, "## $1");
  return s;
}

function extractStage4(content: string): Artifact[] {
  const results: Artifact[] = [];
  const sections = splitBySections(normalizeStage4Markdown(content), "##");

  let maxNum = 0;
  for (const sec of sections) {
    const h = sec.heading.replace(/^#+\s*/, "").trim();
    if (/事件链总检/.test(h)) {
      results.push({
        stage: 4,
        subKey: "chain_check",
        label: "事件链总检",
        content: sec.body,
        updatedAt: now(),
      });
      continue;
    }
    const parsed = parseCoreEventIndexFromHeading(sec.heading);
    if (parsed != null) {
      maxNum = Math.max(maxNum, parsed);
      results.push({
        stage: 4,
        subKey: `event_${parsed}`,
        label: `核心事件 ${parsed}`,
        content: sec.body,
        updatedAt: now(),
      });
      continue;
    }
    if (/核心事件/i.test(h) && !/续|总检/.test(h)) {
      maxNum += 1;
      results.push({
        stage: 4,
        subKey: `event_${maxNum}`,
        label: `核心事件 ${maxNum}`,
        content: sec.body,
        updatedAt: now(),
      });
    }
  }

  return results;
}

/** 场次正文内按 `#### 幕` 切块；返回场次元数据（首幕之前）与各幕正文 */
function splitSceneBodyIntoMus(sceneBody: string): { meta: string; mus: { num: string; body: string }[] } {
  const re = /(?:^|\n)(####\s+[^\n]+)/g;
  const hits: { start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sceneBody)) !== null) {
    hits.push({ start: m.index });
  }
  if (hits.length === 0) {
    return { meta: sceneBody.trim(), mus: [] };
  }

  const meta = sceneBody.slice(0, hits[0].start).trim();
  const mus: { num: string; body: string }[] = [];

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].start;
    const end = i + 1 < hits.length ? hits[i + 1].start : sceneBody.length;
    const chunk = sceneBody.slice(start, end);
    const nl = chunk.indexOf("\n");
    const headLine = nl >= 0 ? chunk.slice(0, nl).trim() : chunk.trim();
    const body = nl >= 0 ? chunk.slice(nl + 1).trim() : "";
    const numMatch = headLine.match(/幕\s*(\d+)/) || headLine.match(/第\s*(\d+)\s*幕/);
    const num = numMatch ? numMatch[1] : String(i + 1);
    mus.push({ num, body });
  }

  mus.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
  return { meta, mus };
}

/** 从 `## 第1集` / `## 第一集` / `第[集数]集` 等解析分集根键 */
function parseEpisodeRootFromHeading(heading: string): { epKey: string; epLabel: string } | null {
  const h = heading.replace(/^#+\s*/, "").trim();
  const titleM = h.match(/《([^》]+)》/);
  const titleSuffix = titleM?.[1]?.trim() ? `：《${titleM[1].trim()}》` : "";
  const ar = h.match(/第\s*(\d+)\s*集/);
  if (ar) {
    const n = ar[1];
    return { epKey: `ep${n}`, epLabel: `第${n}集${titleSuffix}` };
  }
  const cn = h.match(/第\s*([一二三四五六七八九十百千]+)\s*集/);
  if (cn) {
    const idx = cnOrdinalToNum(cn[1]);
    if (idx > 0) return { epKey: `ep${idx}`, epLabel: `第${idx}集${titleSuffix}` };
  }
  if (/第\s*\[集数\]\s*集/.test(h) || /第\s*[Xx?？]\s*集/.test(h)) {
    return {
      epKey: "ep_placeholder",
      epLabel: titleSuffix ? `第?集${titleSuffix}` : "第?集（占位）",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// STAGE 5: 设定集（∆人物 / ∆物品 / ∆场景 + @名称）
// ---------------------------------------------------------------------------

const SETTINGS_CATEGORIES: { re: RegExp; catKey: string; catLabel: string; prefix: string }[] = [
  { re: /∆\s*人物/, catKey: "cat_characters", catLabel: "∆人物", prefix: "char" },
  { re: /∆\s*物品/, catKey: "cat_items", catLabel: "∆物品", prefix: "item" },
  { re: /∆\s*场景/, catKey: "cat_scenes", catLabel: "∆场景", prefix: "scene" },
];

function extractStage5Settings(content: string): Artifact[] {
  const results: Artifact[] = [];
  const sections = splitBySections(content, "##");

  for (const sec of sections) {
    const h = sec.heading.replace(/^#+\s*/, "").trim();
    const cat = SETTINGS_CATEGORIES.find((c) => c.re.test(h));
    if (!cat) continue;

    results.push({
      stage: 5,
      subKey: cat.catKey,
      label: cat.catLabel,
      content: sec.body,
      updatedAt: now(),
    });

    const seen = new Set<string>();
    forEachAssetMention(sec.body, (name, mIndex) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const subKey = `${cat.prefix}_${slugify(name)}`;
      const bodyAfterAt = sec.body.slice(mIndex);
      const nextAt = bodyAfterAt.indexOf("@", 1);
      const nextH = bodyAfterAt.search(/\n##/);
      const endIdx = Math.min(
        nextAt > 0 ? nextAt : Infinity,
        nextH > 0 ? nextH : Infinity,
        bodyAfterAt.length
      );
      const itemBody = bodyAfterAt.slice(0, endIdx).trim();
      results.push({
        stage: 5,
        subKey,
        label: `${cat.catLabel}：@${name}`,
        content: itemBody,
        updatedAt: now(),
        parentKey: cat.catKey,
      });
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// STAGE 6: 分集大纲（## 第N集 → 整块存为 outline_epN）
// 新格式：行内键值对（∆场景：… / 开头钩子：… / 本集剧情：… / 结尾悬念：…）
// 兼容旧格式：若检测到 ### 子标题仍按旧逻辑拆子条目
// ---------------------------------------------------------------------------

function extractStage6Outlines(content: string): Artifact[] {
  const results: Artifact[] = [];
  const topSections = splitBySections(content, "##");

  for (const sec of topSections) {
    const root = parseEpisodeRootFromHeading(sec.heading);
    if (!root) continue;
    const { epKey, epLabel } = root;
    const outlineKey = `outline_${epKey}`;

    results.push({
      stage: 6,
      subKey: outlineKey,
      label: `${epLabel} 大纲`,
      content: sec.body,
      updatedAt: now(),
    });

    // 兼容旧 ### 子标题格式
    const subSections = splitBySections(sec.body, "###");
    if (subSections.length > 0) {
      for (const sub of subSections) {
        const h = sub.heading.replace(/^#+\s*/, "").trim();
        let subKey = "";
        let label = "";
        if (/本集.*资产|出现.*资产/.test(h)) {
          subKey = `${outlineKey}.assets`;
          label = `${epLabel} - 本集资产`;
        } else if (/开头钩子/.test(h)) {
          subKey = `${outlineKey}.hook_open`;
          label = `${epLabel} - 开头钩子`;
        } else if (/本集概述|本集剧情/.test(h)) {
          subKey = `${outlineKey}.summary`;
          label = `${epLabel} - 本集剧情`;
        } else if (/结尾悬念/.test(h)) {
          subKey = `${outlineKey}.hook_end`;
          label = `${epLabel} - 结尾悬念`;
        }
        if (subKey) {
          results.push({
            stage: 6,
            subKey,
            label,
            content: sub.body,
            updatedAt: now(),
            parentKey: outlineKey,
          });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// STAGE 7: 分集剧本（原 STAGE 5）
// ---------------------------------------------------------------------------

/** 分集：`### 第N集` 误级、粘连、## 后缺空格；不误伤 `### 场次` */
function normalizeStage7Markdown(c: string): string {
  let s = c.replace(/\ufeff/g, "");
  s = s.replace(/([^\s\r\n#])(##\s+)/g, "$1\n$2");
  s = s.replace(/^###\s*((?:第[一二三四五六七八九十百千\d]+集)(?:[：:][^\n]*)?)\s*$/gm, "## $1");
  s = s.replace(/^##(?![#\s])(第[^\n]*集[^\n]*)\s*$/gm, "## $1");
  return s;
}

/** 新 STAGE 7：`---` + `正文：` 后拆出 epN / epN.body；否则返回 null */
function trySplitStage7NewFormat(
  heading: string,
  body: string
): { overview: string; bodyText: string } | null {
  const combined = `${heading}\n\n${body}`.trim();
  let m = /\n---\s*\n+\s*正文\s*[：:]\s*\n([\s\S]*)$/m.exec(combined);
  if (!m) {
    m = /(?:^|\n)正文\s*[：:]\s*\n([\s\S]*)$/m.exec(combined);
  }
  if (!m) return null;
  /** 若仍含旧「场次」结构，交给旧解析 */
  if (/###\s*场次\s*\d+/.test(combined)) return null;
  const overview = combined.slice(0, m.index).trim();
  const bodyText = (m[1] ?? "").trim();
  return { overview, bodyText };
}

function extractStage7(content: string): Artifact[] {
  const results: Artifact[] = [];
  const topSections = splitBySections(normalizeStage7Markdown(content), "##");

  for (const sec of topSections) {
    const root = parseEpisodeRootFromHeading(sec.heading);
    if (!root) continue;
    const { epKey, epLabel } = root;

    const newFmt = trySplitStage7NewFormat(sec.heading, sec.body);
    if (newFmt) {
      results.push({
        stage: 7,
        subKey: epKey,
        label: epLabel,
        content: newFmt.overview,
        updatedAt: now(),
      });
      if (newFmt.bodyText.length > 0) {
        results.push({
          stage: 7,
          subKey: `${epKey}.body`,
          label: `${epLabel} - 正文`,
          content: newFmt.bodyText,
          updatedAt: now(),
          parentKey: epKey,
        });
      }
      continue;
    }

    const subSections = splitBySections(sec.body, "###");

    const overviewParts: string[] = [];
    for (const sub of subSections) {
      if (/本集定位/.test(sub.heading)) overviewParts.push(sub.body);
      else if (/本集剧情摘要/.test(sub.heading)) overviewParts.push(sub.body);
      else if (/本集一句/.test(sub.heading)) overviewParts.push(sub.body);
    }
    if (overviewParts.length > 0) {
      results.push({
        stage: 7,
        subKey: epKey,
        label: epLabel,
        content: overviewParts.join("\n\n"),
        updatedAt: now(),
      });
    } else {
      results.push({
        stage: 7,
        subKey: epKey,
        label: epLabel,
        content: sec.body.trim(),
        updatedAt: now(),
      });
    }

    for (const sub of subSections) {
      const sceneMatch = sub.heading.match(/场次\s*(\d+)/);
      if (sceneMatch) {
        const sn = sceneMatch[1];
        const sceneKey = `${epKey}.scene${sn}`;
        const { meta, mus } = splitSceneBodyIntoMus(sub.body);

        if (mus.length > 0) {
          const sceneContent =
            meta.trim().length > 0 ? meta : "（场次元数据较少；正文见下方各「幕」）";
          results.push({
            stage: 7,
            subKey: sceneKey,
            label: `${epLabel} - 场次${sn}`,
            content: sceneContent,
            updatedAt: now(),
            parentKey: epKey,
          });
          for (const mu of mus) {
            results.push({
              stage: 7,
              subKey: `${sceneKey}.m${mu.num}`,
              label: `${epLabel} - 场次${sn} - 幕${mu.num}`,
              content: mu.body,
              updatedAt: now(),
              parentKey: sceneKey,
            });
          }
        } else {
          results.push({
            stage: 7,
            subKey: sceneKey,
            label: `${epLabel} - 场次${sn}`,
            content: sub.body,
            updatedAt: now(),
            parentKey: epKey,
          });
        }
        continue;
      }
      if (/集尾卡点|集尾/.test(sub.heading)) {
        results.push({
          stage: 7,
          subKey: `${epKey}.hook`,
          label: `${epLabel} - 集尾卡点`,
          content: sub.body,
          updatedAt: now(),
          parentKey: epKey,
        });
        continue;
      }
      if (/本集复盘/.test(sub.heading)) {
        results.push({
          stage: 7,
          subKey: `${epKey}.review`,
          label: `${epLabel} - 本集复盘`,
          content: sub.body,
          updatedAt: now(),
          parentKey: epKey,
        });
      }
    }
  }

  return results;
}

const EXTRACTORS: Record<number, (content: string) => Artifact[]> = {
  1: extractStage1,
  2: extractStage2,
  3: extractStage3,
  4: extractStage4,
  5: extractStage5Settings,
  6: extractStage6Outlines,
  7: extractStage7,
};

export function extractArtifacts(content: string, stage: number): Artifact[] {
  const cleanContent = stripThinkingBlocks(content).trim();
  const extractor = EXTRACTORS[stage];
  if (!extractor) return [];

  const results = extractor(cleanContent);

  if (results.length === 0) {
    const minChars = stage === 1 ? 8 : 50;
    if (cleanContent.length < minChars) return [];
    if (stage === 1 && /(?:梗概|大纲|剧情)/.test(cleanContent)) {
      return [
        {
          stage: 1,
          subKey: "full",
          label: "STAGE 1 完整内容",
          content: cleanContent,
          updatedAt: now(),
        },
      ];
    }
    if (!looksLikeTemplateDeliverable(cleanContent)) return [];
    return [
      {
        stage,
        subKey: "full",
        label: `STAGE ${stage} 完整内容`,
        content: cleanContent,
        updatedAt: now(),
      },
    ];
  }

  return results;
}

export function mergeArtifacts(existing: Artifact[], incoming: Artifact[]): Artifact[] {
  const map = new Map<string, Artifact>();
  for (const a of existing) map.set(`${a.stage}:${a.subKey || "legacy"}`, a);
  for (const a of incoming) map.set(`${a.stage}:${a.subKey}`, a);
  return Array.from(map.values()).sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    if (a.stage === 6 && b.stage === 6) {
      return compareStage6SubKeys(a.subKey || "", b.subKey || "");
    }
    return (a.subKey || "").localeCompare(b.subKey || "");
  });
}

/** 单次回复中 STAGE 2 条目数 ≥ 此值且含 char_* 时，视为整版人物卡，可替换该阶段全部旧产物 */
export const STAGE2_BULK_REPLACE_MIN = 6;

/** 用户是否明确要求整版重做人物（用于替换 STAGE 2 全部产物，避免改名残留） */
export function userRequestsStage2FullReplace(userContent: string): boolean {
  return /整版(?:人物|人设)?|全部重写(?:人物|人设)?|重置(?:掉|了)?(?:的)?人物|从头(?:做|写|来|弄).*人物|替换(?:掉|了)?(?:的)?人物|推翻(?:掉)?.*人物|人物(?:全部|整体)?重做|重写(?:全部|所有)人物|人设.*(?:重做|重来)/u.test(
    userContent.trim()
  );
}

/** 本轮提取结果是否像「一次性交付的完整人物包」 */
export function incomingIsStage2BulkReplace(incoming: Artifact[]): boolean {
  const s2 = incoming.filter((a) => a.stage === 2);
  if (s2.length < STAGE2_BULK_REPLACE_MIN) return false;
  return s2.some((a) => a.subKey.startsWith("char_"));
}

/** 先剔除指定 stage 的旧产物，再按 subKey 合并（用于整版替换） */
export function mergeArtifactsWithPolicy(
  existing: Artifact[],
  incoming: Artifact[],
  opts?: { replaceStages?: number[] }
): Artifact[] {
  let base = existing;
  if (opts?.replaceStages?.length) {
    const drop = new Set(opts.replaceStages);
    base = existing.filter((a) => !drop.has(a.stage));
  }
  return mergeArtifacts(base, incoming);
}

/** 若本轮含 STAGE 2 产物且满足整版替换条件，返回 { replaceStages:[2] } */
export function stage2FullReplaceOpts(
  incoming: Artifact[],
  lastUserContent: string | undefined
): { replaceStages: number[] } | undefined {
  const hasS2 = incoming.some((a) => a.stage === 2);
  if (!hasS2) return undefined;
  if (lastUserContent && userRequestsStage2FullReplace(lastUserContent)) {
    return { replaceStages: [2] };
  }
  if (incomingIsStage2BulkReplace(incoming)) return { replaceStages: [2] };
  return undefined;
}

export function artifactsWorthMerging(fullReply: string, list: Artifact[]): boolean {
  if (list.length === 0) return false;
  if (list.length === 1 && list[0].subKey === "full" && !looksLikeTemplateDeliverable(fullReply)) {
    /** 避免：有「梗概」语义但缺 ## 时落 full，却因 looksLike 过严整轮不落库 */
    if (
      list[0].stage === 1 &&
      fullReply.length >= 24 &&
      /(?:一句话|梗概|大纲|项目定位|剧情)/.test(fullReply)
    ) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * 从一条助手全文解析**用户点击的阶段**（右侧「重新记录」）。
 * 与自动落库不同：这里**不会**把解析结果改写到其他 STAGE，避免 STAGE 1 空着却更新了 STAGE 2。
 */
export function reExtractForPreferredStage(
  fullReply: string,
  preferredStage: number
): { extracted: Artifact[]; stageUsed: number } | null {
  const trimmed = fullReply.trim();
  if (!trimmed || preferredStage < 1 || preferredStage > 7) return null;

  const extracted = extractArtifacts(trimmed, preferredStage);
  if (extracted.length === 0) return null;

  const mergeOk = artifactsWorthMerging(trimmed, extracted);
  /** 手动触发时允许写入「整段 full」，避免仅因缺少模板标记而拒绝 */
  const allowManualFull =
    extracted.length === 1 &&
    extracted[0].subKey === "full" &&
    extracted[0].stage === preferredStage &&
    trimmed.length >= 12;

  if (mergeOk || allowManualFull) {
    return { extracted, stageUsed: preferredStage };
  }

  return null;
}
