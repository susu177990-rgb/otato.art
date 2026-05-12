import type { Artifact } from "./types";

/** 从圣经正文中粗提取「像角色名」的短语（列表行、加粗标题等启发式） */
export function extractNameCandidatesFromBible(seriesBible: string): string[] {
  const text = seriesBible.trim();
  if (!text) return [];
  const names = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const mBold = t.match(/^\*\*([^*]+)\*\*/);
    if (mBold) {
      const inner = mBold[1].trim();
      if (inner.length >= 2 && inner.length <= 24 && !/^[\d.\s]+$/.test(inner)) {
        names.add(inner);
      }
    }
    const mDash = t.match(/^[-*]\s*\*\*([^*]+)\*\*/);
    if (mDash) {
      const inner = mDash[1].trim();
      if (inner.length >= 2 && inner.length <= 24) names.add(inner);
    }
    const mPlain = t.match(/^[-*]\s*([^\s：:，,。]{2,20})[：:]/);
    if (mPlain) names.add(mPlain[1].trim());
  }
  return [...names];
}

/** 从人物阶段产物取已建档角色展示名 */
export function characterLabelsFromArtifacts(artifacts: Artifact[]): string[] {
  const stage2 = artifacts.filter(
    (a) =>
      a.stage === 2 &&
      (a.subKey.startsWith("char_") || a.subKey.startsWith("supporting_"))
  );
  return stage2
    .map((a) =>
      a.label
        .replace(/^(?:角色|主角|配角)(?:[一二三四五六七八九十\d]+)?[：:]\s*/, "")
        .replace(/^(角色|配角)[：:]\s*/, "")
        .trim()
    )
    .filter(Boolean);
}

export interface BibleAuditIssue {
  kind: "bible_name_missing_in_cast";
  name: string;
}

/** 圣经里出现的候选名，在人物产物中找不到近似匹配时提示 */
export function auditBibleVsCast(seriesBible: string, artifacts: Artifact[]): BibleAuditIssue[] {
  const candidates = extractNameCandidatesFromBible(seriesBible);
  const labels = characterLabelsFromArtifacts(artifacts);
  const issues: BibleAuditIssue[] = [];
  for (const name of candidates) {
    const hit = labels.some(
      (l) =>
        l.includes(name) ||
        name.includes(l) ||
        l.toLowerCase() === name.toLowerCase()
    );
    if (!hit) {
      issues.push({ kind: "bible_name_missing_in_cast", name });
    }
  }
  return issues;
}
