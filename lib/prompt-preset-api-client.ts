import type { PromptPresetKind, SitePromptPreset } from "@/lib/db/prompt-preset-store";

export const PROMPT_PRESET_KINDS: PromptPresetKind[] = ["image", "video", "chat"];

async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error?.trim() || fallback;
}

export async function fetchSitePromptPresets(kind: PromptPresetKind): Promise<SitePromptPreset[]> {
  const res = await fetch(`/api/site-prompt-presets?kind=${encodeURIComponent(kind)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res, "无法加载预设库"));
  const data = (await res.json()) as { presets: SitePromptPreset[] };
  return data.presets;
}

export async function fetchAllSitePromptPresets(): Promise<SitePromptPreset[]> {
  const grouped = await Promise.all(PROMPT_PRESET_KINDS.map((kind) => fetchSitePromptPresets(kind)));
  return grouped.flat();
}

export async function replaceSitePromptPresets(
  kind: PromptPresetKind,
  presets: SitePromptPreset[],
): Promise<SitePromptPreset[]> {
  const res = await fetch("/api/site-prompt-presets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, presets }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "无法保存预设库"));
  const data = (await res.json()) as { presets: SitePromptPreset[] };
  return data.presets;
}

export async function setSitePromptPresetFavorite(
  presetId: string,
  isFavorite: boolean,
): Promise<{ presetId: string; isFavorite: boolean }> {
  const res = await fetch("/api/site-prompt-presets/favorites", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presetId, isFavorite }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "无法更新收藏"));
  const data = (await res.json()) as { presetId: string; isFavorite: boolean };
  return data;
}
