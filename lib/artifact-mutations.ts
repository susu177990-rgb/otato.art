import type { Artifact } from "./types";

export function artifactKey(a: Pick<Artifact, "stage" | "subKey">): string {
  return `${a.stage}:${a.subKey}`;
}

/**
 * STAGE 6 分集大纲 subKey 排序：`outline_ep10` 须在 `outline_ep2` 之后（勿用 localeCompare）。
 * 子键 `outline_ep3.hook_open` 先按集号，再按叙事顺序 assets → hook_open → summary → hook_end。
 */
export function compareStage6SubKeys(sa: string, sb: string): number {
  const epNum = (s: string): number | null => {
    const m = /^outline_ep(\d+)/u.exec(s);
    return m ? parseInt(m[1], 10) : null;
  };
  const na = epNum(sa);
  const nb = epNum(sb);
  if (na != null && nb != null && na !== nb) return na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  const suffix = (s: string) => {
    const i = s.indexOf(".");
    return i >= 0 ? s.slice(i + 1) : "";
  };
  const rank = (suf: string) => {
    if (suf === "" || suf === undefined) return 0;
    if (suf === "assets") return 1;
    if (suf === "hook_open") return 2;
    if (suf === "summary") return 3;
    if (suf === "hook_end") return 4;
    return 50;
  };
  const ra = rank(suffix(sa));
  const rb = rank(suffix(sb));
  if (ra !== rb) return ra - rb;
  return sa.localeCompare(sb);
}

/** ISO 时间戳 */
export function artifactNow(): string {
  return new Date().toISOString();
}

/**
 * 在列表中按 stage+subKey 替换或追加一条。
 * 允许空正文（用于新建占位槽、或清空后暂存）；删除条目须用 `removeArtifactByKey` / 界面「移除」。
 */
export function upsertArtifact(
  existing: Artifact[],
  next: Omit<Artifact, "updatedAt"> & { updatedAt?: string }
): Artifact[] {
  const key = artifactKey(next);
  const content = next.content.trim();
  const base = existing.filter((a) => artifactKey(a) !== key);

  const merged: Artifact = {
    ...next,
    content,
    updatedAt: next.updatedAt ?? artifactNow(),
  };
  return [...base, merged].sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    if (a.stage === 6 && b.stage === 6) {
      return compareStage6SubKeys(a.subKey || "", b.subKey || "");
    }
    return (a.subKey || "").localeCompare(b.subKey || "");
  });
}

export function removeArtifactByKey(existing: Artifact[], stage: number, subKey: string): Artifact[] {
  const key = `${stage}:${subKey}`;
  return existing.filter((a) => artifactKey(a) !== key);
}

/**
 * 收集从 rootSubKey 起、沿 parentKey 向下的整条子树（含根）。
 */
export function collectSubtreeSubKeys(artifacts: Artifact[], rootSubKey: string): Set<string> {
  const rm = new Set<string>([rootSubKey]);
  let prev = -1;
  while (rm.size !== prev) {
    prev = rm.size;
    for (const a of artifacts) {
      if (a.parentKey && rm.has(a.parentKey)) {
        rm.add(a.subKey);
      }
    }
  }
  return rm;
}

export function removeSubtreeFromList(artifacts: Artifact[], rootSubKey: string): Artifact[] {
  const rm = collectSubtreeSubKeys(artifacts, rootSubKey);
  return artifacts.filter((a) => !rm.has(a.subKey));
}

/** 手写「角色」槽位用：与 extract slug 规则一致，仅字母数字与下划线 */
export function slugifyCharName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "unnamed";
}
