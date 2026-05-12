import type { ProjectMeta } from "@/lib/types";

/** 与生成规划提示、解析器一致的固定节标题（须逐字匹配节标题行） */
export const CREATIVE_BRIEF_META_SECTION_TITLE = "立项字段（系统自动识别）";

const SECTION_HEADER_RE = /^##\s*立项字段（系统自动识别）\s*$/im;

function baseMeta(fallbackName: string): ProjectMeta {
  return {
    seriesTitle: fallbackName.trim() || "未命名项目",
    episodeCount: "",
    episodeDurationMinutes: null,
    targetMarket: "",
    dialogueLanguage: "",
    extraNotes: "",
  };
}

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("「") && t.endsWith("」"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** 将「键：值」行映射到 ProjectMeta 字段 */
function applyKeyValue(meta: ProjectMeta, rawKey: string, rawVal: string): void {
  const key = rawKey.replace(/\s+/g, "").toLowerCase();
  const val = stripWrappingQuotes(rawVal);
  if (!val || val === "待确认") return;

  if (key === "剧名" || key === "作品名" || key === "项目名称") {
    meta.seriesTitle = val;
    return;
  }
  if (key === "集数/区间" || key === "集数" || key === "总集数" || key === "体量") {
    meta.episodeCount = val;
    return;
  }
  if (
    key === "单集时长（分钟）" ||
    key === "单集时长(分钟)" ||
    key === "单集时长" ||
    key === "每集时长" ||
    key === "单集约时长（分钟）"
  ) {
    const n = parseFloat(val.replace(/[^\d.]/g, ""));
    meta.episodeDurationMinutes = Number.isFinite(n) && n > 0 ? n : null;
    return;
  }
  if (key === "目标市场" || key === "市场") {
    meta.targetMarket = val;
    return;
  }
  if (key === "台词语言" || key === "对白语言" || key === "语言") {
    meta.dialogueLanguage = val;
    return;
  }
  if (key === "备注" || key === "其他说明" || key === "补充") {
    meta.extraNotes = val;
  }
}

/** 截取「## 立项字段…」节正文（到下一个二级标题或文末） */
function extractMetaSection(markdown: string): string | null {
  const m = markdown.match(SECTION_HEADER_RE);
  if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length;
  const tail = markdown.slice(start);
  const next = tail.search(/^##\s+/m);
  const body = (next === -1 ? tail : tail.slice(0, next)).trim();
  return body.length ? body : null;
}

/** 无固定节时的弱启发式（旧稿或手改漏节时尽量兜底） */
function heuristicFill(markdown: string, meta: ProjectMeta): void {
  const text = markdown.replace(/\r\n/g, "\n");

  if (!meta.seriesTitle || meta.seriesTitle === "未命名项目") {
    const h1 = text.match(/^#\s+(.+)$/m);
    if (h1 && !/创作思路|确认书/i.test(h1[1])) {
      meta.seriesTitle = h1[1].trim();
    }
  }

  if (!meta.episodeCount) {
    const ep = text.match(/(?:总)?集数(?:[\/／]区间)?\s*[：:]\s*([^\n]+)/);
    if (ep) meta.episodeCount = ep[1].trim();
    else {
      const range = text.match(/(\d+\s*[～~\-—]\s*\d+|\d+)\s*集/);
      if (range) meta.episodeCount = range[0].replace(/\s*集$/, "").trim() + " 集";
    }
  }

  if (meta.episodeDurationMinutes == null) {
    const dur = text.match(/单集(?:约)?时长\s*[：:]\s*([^\n\d]*)(\d+(?:\.\d+)?)\s*分钟?/);
    if (dur) {
      const n = parseFloat(dur[2]);
      if (Number.isFinite(n) && n > 0) meta.episodeDurationMinutes = n;
    }
  }

  if (!meta.targetMarket) {
    const mk = text.match(/目标市场\s*[：:]\s*([^\n]+)/);
    if (mk) meta.targetMarket = mk[1].trim();
  }

  if (!meta.dialogueLanguage) {
    const lg = text.match(/(?:台词|对白)语言\s*[：:]\s*([^\n]+)/);
    if (lg) meta.dialogueLanguage = lg[1].trim();
  }

}

/**
 * 从《创作思路确认书》Markdown 解析立项表单（ProjectMeta）。
 * 优先解析文末 `## 立项字段（系统自动识别）` 下的「键：值」行；无需调用大模型。
 */
export function parseCreativeBriefToProjectMeta(
  markdown: string,
  fallbackName: string
): { meta: ProjectMeta; warnings: string[] } {
  const warnings: string[] = [];
  const meta = baseMeta(fallbackName.trim() || "未命名项目");

  const initial = { ...meta };
  const section = extractMetaSection(markdown);
  if (section) {
    for (const line of section.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const kv = trimmed.match(/^([^：:]+)\s*[：:]\s*(.*)$/);
      if (kv) applyKeyValue(meta, kv[1].trim(), kv[2]);
    }
    const hasAny =
      meta.seriesTitle.trim() !== initial.seriesTitle.trim() ||
      meta.episodeCount.trim() !== "" ||
      meta.episodeDurationMinutes != null ||
      meta.targetMarket.trim() !== "" ||
      meta.dialogueLanguage.trim() !== "" ||
      meta.extraNotes.trim() !== "";

    if (!hasAny) {
      warnings.push("「立项字段」节未识别到有效键值，已尝试从全文启发式补全。");
      heuristicFill(markdown, meta);
    }
  } else {
    warnings.push(`未找到「## ${CREATIVE_BRIEF_META_SECTION_TITLE}」标准节，已用启发式从全文提取（可能不准）。`);
    heuristicFill(markdown, meta);
  }

  if (!meta.seriesTitle.trim()) {
    meta.seriesTitle = fallbackName.trim() || "未命名项目";
  }

  return { meta, warnings };
}
