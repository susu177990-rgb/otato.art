import type { PromptPresetKind } from "@/lib/db/prompt-preset-store";

export const PROMPT_TAG_GROUPS: Record<PromptPresetKind, string[]> = {
  image: ["资产", "真人", "2D", "3D", "道具", "场景", "角色", "滤镜", "艺术", "分镜"],
  video: ["视频分类1", "视频分类2", "视频分类3"],
  chat: ["对话分类1", "对话分类2", "对话分类3"],
};

export const PROMPT_UNCATEGORIZED_TAG = "__uncategorized__";

export function normalizePromptTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const tag = String(item ?? "").trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function knownPromptTagsForKind(kind: PromptPresetKind): string[] {
  return PROMPT_TAG_GROUPS[kind] ?? [];
}

export function togglePromptTag(tags: string[], tag: string): string[] {
  const normalized = normalizePromptTags(tags);
  return normalized.includes(tag) ? normalized.filter((item) => item !== tag) : [...normalized, tag];
}
