import type {
  PromptPresetKind,
  PromptPresetSubmission,
  PromptPresetSubmissionStatus,
  SitePromptPreset,
} from "@/lib/db/prompt-preset-store";

export const PROMPT_PRESET_KINDS: PromptPresetKind[] = ["image", "video", "chat"];

async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error?.trim() || fallback;
}

export async function fetchSitePromptPresets(kind: PromptPresetKind): Promise<SitePromptPreset[]> {
  const res = await fetch(`/api/site-prompt-presets?kind=${encodeURIComponent(kind)}`);
  if (!res.ok) throw new Error(await readApiError(res, "无法加载预设库"));
  const data = (await res.json()) as { presets: SitePromptPreset[] };
  return data.presets;
}

export async function fetchAllSitePromptPresets(): Promise<SitePromptPreset[]> {
  const res = await fetch("/api/site-prompt-presets?kind=all");
  if (!res.ok) throw new Error(await readApiError(res, "无法加载预设库"));
  const data = (await res.json()) as { presets: SitePromptPreset[] };
  return data.presets;
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

export async function submitPromptPresetContribution(
  preset: Pick<SitePromptPreset, "kind" | "title" | "promptTemplate" | "tags" | "description"> & { coverFile?: File | null },
): Promise<{ submission: PromptPresetSubmission }> {
  const body = new FormData();
  body.set("kind", preset.kind);
  body.set("title", preset.title);
  body.set("promptTemplate", preset.promptTemplate);
  body.set("description", preset.description ?? "");
  body.set("tags", preset.tags.join(","));
  if (preset.coverFile) body.set("coverFile", preset.coverFile);

  const res = await fetch("/api/site-prompt-presets", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(await readApiError(res, "无法提交提示词投稿"));
  return (await res.json()) as { submission: PromptPresetSubmission };
}

export async function deleteSitePromptPreset(presetId: string): Promise<{ presetId: string }> {
  const res = await fetch("/api/site-prompt-presets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presetId }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "无法删除提示词预设"));
  return (await res.json()) as { presetId: string };
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

export async function fetchPromptPresetSubmissions(
  status: PromptPresetSubmissionStatus | "all" = "pending",
): Promise<PromptPresetSubmission[]> {
  const res = await fetch(`/api/admin/prompt-preset-submissions?status=${encodeURIComponent(status)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res, "无法加载投稿审核列表"));
  const data = (await res.json()) as { submissions: PromptPresetSubmission[] };
  return data.submissions;
}

export async function reviewPromptPresetSubmission(
  submissionId: string,
  action: "approve" | "reject",
  reviewNote = "",
): Promise<{ submission: PromptPresetSubmission; preset?: SitePromptPreset }> {
  const res = await fetch("/api/admin/prompt-preset-submissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId, action, reviewNote }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "无法更新投稿审核状态"));
  return (await res.json()) as { submission: PromptPresetSubmission; preset?: SitePromptPreset };
}
