import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageWorkspaceSettings } from "@/lib/image-workspace";
import type { VideoWorkspaceSettings } from "@/lib/video-workspace";

export type PromptPresetKind = "image" | "video" | "chat";

export type SitePromptPreset = {
  id: string;
  kind: PromptPresetKind;
  title: string;
  promptTemplate: string;
  coverImageUrl: string;
  refSlotHints: string[];
  description?: string;
  isFavorite?: boolean;
};

type SitePromptPresetRow = {
  id: string;
  preset_type: PromptPresetKind;
  title: string;
  prompt_template: string | null;
  cover_image_url: string | null;
  ref_slot_hints: unknown;
  description: string | null;
};

function isMissingPresetTable(e: unknown): boolean {
  const row = e && typeof e === "object" ? (e as { code?: unknown; message?: unknown }) : null;
  const code = typeof row?.code === "string" ? row.code : "";
  const message = typeof row?.message === "string" ? row.message : e instanceof Error ? e.message : String(e);

  // PGRST205: PostgREST missing table in schema cache
  // 42P01: PostgreSQL relation does not exist
  if (code === "PGRST205" || code === "42P01") return true;

  // PGRST204 / 42703: Column does not exist
  if (code === "PGRST204" || code === "42703") return false;

  // Fallback: check messages related to table/relation missing, avoiding matching column-missing
  return /Could not find the table|schema cache/i.test(message) ||
         (/relation.*does not exist/i.test(message) && message.includes("site_prompt_presets"));
}

function quoteForSupabaseIn(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function rowToPreset(row: SitePromptPresetRow): SitePromptPreset {
  const refSlotHints = Array.isArray(row.ref_slot_hints)
    ? row.ref_slot_hints.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  return {
    id: row.id,
    kind: row.preset_type,
    title: row.title.trim() || row.id,
    promptTemplate: row.prompt_template ?? "",
    coverImageUrl: row.cover_image_url?.trim() ?? "",
    refSlotHints,
    description: row.description ?? undefined,
    isFavorite: false,
  };
}

export async function listFavoritePromptPresetIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("site_prompt_preset_favorites")
    .select("preset_id")
    .eq("user_id", userId);

  if (error) {
    if (/site_prompt_preset_favorites|Could not find the table|schema cache/i.test(error.message)) return new Set();
    throw error;
  }

  return new Set((data ?? []).map((row) => String((row as { preset_id?: unknown }).preset_id ?? "")).filter(Boolean));
}

export async function listSitePromptPresetsByKindForUser(
  supabase: SupabaseClient,
  kind: PromptPresetKind,
  userId: string,
): Promise<SitePromptPreset[]> {
  const [presets, favoriteIds] = await Promise.all([
    listSitePromptPresetsByKind(supabase, kind),
    listFavoritePromptPresetIds(supabase, userId),
  ]);
  return presets.map((preset) => ({ ...preset, isFavorite: favoriteIds.has(preset.id) }));
}

export async function listSitePromptPresetsByKind(
  supabase: SupabaseClient,
  kind: PromptPresetKind,
): Promise<SitePromptPreset[]> {
  const all = await listSitePromptPresets(supabase);
  return all.filter((preset) => preset.kind === kind);
}

export async function listSitePromptPresets(supabase: SupabaseClient): Promise<SitePromptPreset[]> {
  const { data, error } = await supabase
    .from("site_prompt_presets")
    .select("id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, description")
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingPresetTable(error)) return [];
    throw error;
  }

  return (data ?? []).map((row) => rowToPreset(row as SitePromptPresetRow));
}

export function applyPromptLibraryToImageWorkspace(
  workspace: ImageWorkspaceSettings,
  presets: SitePromptPreset[],
): ImageWorkspaceSettings {
  const imagePresets = presets.filter((preset) => preset.kind === "image");
  if (imagePresets.length === 0) return workspace;

  const prompts = { ...workspace.prompts };
  const coverImageUrlByMode = { ...workspace.coverImageUrlByMode };
  const refSlotHintsByMode = { ...workspace.refSlotHintsByMode };
  const customModes = [...workspace.customModes];

  for (const preset of imagePresets) {
    prompts[preset.id] = preset.promptTemplate;
    if (preset.coverImageUrl) coverImageUrlByMode[preset.id] = preset.coverImageUrl;
    else delete coverImageUrlByMode[preset.id];
    if (preset.refSlotHints.length > 0) refSlotHintsByMode[preset.id] = preset.refSlotHints;
    else delete refSlotHintsByMode[preset.id];
    if (!customModes.some((mode) => mode.id === preset.id)) {
      customModes.push({ id: preset.id, label: preset.title });
    }
  }

  return { ...workspace, prompts, coverImageUrlByMode, refSlotHintsByMode, customModes };
}

export function applyPromptLibraryToVideoWorkspace(
  workspace: VideoWorkspaceSettings,
  presets: SitePromptPreset[],
): VideoWorkspaceSettings {
  const videoPresets = presets.filter((preset) => preset.kind === "video");
  if (videoPresets.length === 0) return workspace;

  const prompts = { ...workspace.prompts };
  const coverImageUrlByMode = { ...workspace.coverImageUrlByMode };
  const customModes = [...workspace.customModes];

  for (const preset of videoPresets) {
    prompts[preset.id] = preset.promptTemplate;
    if (preset.coverImageUrl) coverImageUrlByMode[preset.id] = preset.coverImageUrl;
    else delete coverImageUrlByMode[preset.id];
    if (!customModes.some((mode) => mode.id === preset.id)) {
      customModes.push({ id: preset.id, label: preset.title });
    }
  }

  return { ...workspace, prompts, coverImageUrlByMode, customModes };
}

export async function replaceSitePromptPresetsByKind(
  supabase: SupabaseClient,
  kind: PromptPresetKind,
  presets: SitePromptPreset[],
): Promise<void> {
  const rows = presets.map((preset) => ({
    id: preset.id,
    preset_type: kind,
    title: preset.title.trim() || preset.id,
    prompt_template: preset.promptTemplate ?? "",
    cover_image_url: preset.coverImageUrl?.trim() || null,
    ref_slot_hints: kind === "chat" ? [] : preset.refSlotHints ?? [],
    description: preset.description?.trim() || null,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("site_prompt_presets").upsert(rows, { onConflict: "id" });
    if (error) {
      if (isMissingPresetTable(error)) return;
      throw error;
    }
  }

  const deleteQuery = supabase.from("site_prompt_presets").delete().eq("preset_type", kind);
  const { error: deleteError } =
    rows.length === 0
      ? await deleteQuery
      : await deleteQuery.not("id", "in", `(${rows.map((row) => quoteForSupabaseIn(String(row.id))).join(",")})`);

  if (deleteError && !isMissingPresetTable(deleteError)) throw deleteError;
}

function imageWorkspaceRows(workspace: ImageWorkspaceSettings): Array<Record<string, unknown>> {
  return workspace.customModes.map((mode) => ({
    id: mode.id,
    preset_type: "image",
    title: mode.label.trim() || mode.id,
    prompt_template: workspace.prompts[mode.id] ?? "",
    cover_image_url: workspace.coverImageUrlByMode[mode.id] || null,
    ref_slot_hints: workspace.refSlotHintsByMode[mode.id] ?? [],
    description: null,
    updated_at: new Date().toISOString(),
  }));
}

function videoWorkspaceRows(workspace: VideoWorkspaceSettings): Array<Record<string, unknown>> {
  return workspace.customModes.map((mode) => ({
    id: mode.id,
    preset_type: "video",
    title: mode.label.trim() || mode.id,
    prompt_template: workspace.prompts[mode.id] ?? "",
    cover_image_url: workspace.coverImageUrlByMode[mode.id] || null,
    ref_slot_hints: [],
    description: null,
    updated_at: new Date().toISOString(),
  }));
}

export async function syncPromptLibraryFromWorkspaces(
  supabase: SupabaseClient,
  imageWorkspace: ImageWorkspaceSettings,
  videoWorkspace: VideoWorkspaceSettings,
): Promise<void> {
  const rows = [...imageWorkspaceRows(imageWorkspace), ...videoWorkspaceRows(videoWorkspace)];
  const wantedIds = rows.map((row) => String(row.id));

  if (rows.length > 0) {
    const { error } = await supabase.from("site_prompt_presets").upsert(rows, { onConflict: "id" });
    if (error) {
      if (isMissingPresetTable(error)) return;
      throw error;
    }
  }

  const deleteQuery = supabase.from("site_prompt_presets").delete().in("preset_type", ["image", "video"]);
  const { error: deleteError } =
    wantedIds.length === 0
      ? await deleteQuery
      : await deleteQuery.not("id", "in", `(${wantedIds.map((id) => quoteForSupabaseIn(id)).join(",")})`);

  if (deleteError && !isMissingPresetTable(deleteError)) throw deleteError;
}
