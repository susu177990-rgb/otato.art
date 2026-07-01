import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageWorkspaceSettings } from "@/lib/image-workspace";
import type { VideoWorkspaceSettings } from "@/lib/video-workspace";
import { normalizePromptTags } from "@/lib/prompt-tags";

export type PromptPresetKind = "image" | "video" | "chat";

export type SitePromptPreset = {
  id: string;
  kind: PromptPresetKind;
  title: string;
  promptTemplate: string;
  coverImageUrl: string;
  refSlotHints: string[];
  tags: string[];
  description?: string;
  createdAt?: string;
  sortOrder?: number | null;
  isFavorite?: boolean;
};

export type PromptPresetSubmissionStatus = "pending" | "approved" | "rejected";

export type PromptPresetSubmission = SitePromptPreset & {
  status: PromptPresetSubmissionStatus;
  submitterUserId: string;
  submitterEmail?: string;
  publishedPresetId?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
};

export function newUserPromptPresetId(kind: PromptPresetKind): string {
  return `user_preset_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newPromptPresetSubmissionId(kind: PromptPresetKind): string {
  return `submission_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPresetRow(kind: PromptPresetKind, preset: SitePromptPreset, sortOrder = 0): Record<string, unknown> {
  const title = preset.title.trim() || preset.id;
  const promptTemplate = preset.promptTemplate ?? "";
  const description = preset.description?.trim() || null;
  return {
    id: preset.id,
    key: preset.id,
    category: kind,
    title,
    description,
    summary: description,
    body: promptTemplate,
    tags: normalizePromptTags(preset.tags),
    sort_order: sortOrder,
    preset_type: kind,
    prompt_template: promptTemplate,
    cover_image_url: preset.coverImageUrl?.trim() || null,
    ref_slot_hints: kind === "chat" ? [] : preset.refSlotHints ?? [],
    display_label: title,
    chat_usage_hint: null,
    skills: [],
    imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

type SitePromptPresetRow = {
  id: string;
  preset_type: PromptPresetKind;
  title: string;
  prompt_template: string | null;
  cover_image_url: string | null;
  ref_slot_hints: unknown;
  tags: unknown;
  description: string | null;
  sort_order: number | null;
  created_at?: string | null;
};

type PromptPresetSubmissionRow = {
  id: string;
  preset_type: PromptPresetKind;
  title: string;
  prompt_template: string | null;
  cover_image_url: string | null;
  ref_slot_hints: unknown;
  tags: unknown;
  description: string | null;
  submitter_user_id: string;
  submitter_email: string | null;
  status: PromptPresetSubmissionStatus;
  published_preset_id: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
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
    tags: normalizePromptTags(row.tags),
    description: row.description ?? undefined,
    createdAt: row.created_at ?? undefined,
    sortOrder: row.sort_order,
    isFavorite: false,
  };
}

function parsePresetIdTimestamp(id: string): number | null {
  const match = /^(?:user_preset|community)_(?:image|video|chat)_([a-z0-9]+)_/i.exec(id);
  if (!match) return null;
  const value = parseInt(match[1], 36);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function presetAddedMs(preset: SitePromptPreset): number {
  const fromId = parsePresetIdTimestamp(preset.id);
  if (fromId != null) return fromId;
  const fromCreatedAt = Date.parse(preset.createdAt ?? "");
  return Number.isFinite(fromCreatedAt) ? fromCreatedAt : Number.MAX_SAFE_INTEGER;
}

function comparePresetAddedAscending(a: SitePromptPreset, b: SitePromptPreset): number {
  const byAdded = presetAddedMs(a) - presetAddedMs(b);
  if (byAdded !== 0) return byAdded;
  const bySortOrder = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
  if (bySortOrder !== 0) return bySortOrder;
  return a.id.localeCompare(b.id);
}

function rowToSubmission(row: PromptPresetSubmissionRow): PromptPresetSubmission {
  const preset = rowToPreset({
    id: row.id,
    preset_type: row.preset_type,
    title: row.title,
    prompt_template: row.prompt_template,
    cover_image_url: row.cover_image_url,
    ref_slot_hints: row.ref_slot_hints,
    tags: row.tags,
    description: row.description,
    sort_order: 0,
  });
  return {
    ...preset,
    status: row.status,
    submitterUserId: row.submitter_user_id,
    submitterEmail: row.submitter_email ?? undefined,
    publishedPresetId: row.published_preset_id ?? undefined,
    reviewNote: row.review_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at ?? undefined,
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
  const { data, error } = await supabase
    .from("site_prompt_presets")
    .select("id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, tags, description, sort_order, created_at")
    .eq("preset_type", kind)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingPresetTable(error)) return [];
    throw error;
  }

  return (data ?? []).map((row) => rowToPreset(row as SitePromptPresetRow));
}

export async function listSitePromptPresets(supabase: SupabaseClient): Promise<SitePromptPreset[]> {
  const { data, error } = await supabase
    .from("site_prompt_presets")
    .select("id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, tags, description, sort_order, created_at")
    .order("sort_order", { ascending: true })
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
  const imagePresets = presets.filter((preset) => preset.kind === "image").sort(comparePresetAddedAscending);
  if (imagePresets.length === 0) return workspace;

  const prompts = { ...workspace.prompts };
  const coverImageUrlByMode = { ...workspace.coverImageUrlByMode };
  const refSlotHintsByMode = { ...workspace.refSlotHintsByMode };
  const existingCustomModeById = new Map(workspace.customModes.map((mode) => [mode.id, mode]));
  const presetIds = new Set(imagePresets.map((preset) => preset.id));
  const customModes = workspace.customModes.filter((mode) => !presetIds.has(mode.id));
  const promptTagsByMode = { ...workspace.promptTagsByMode };
  const promptDescriptionsByMode = { ...workspace.promptDescriptionsByMode };

  for (const preset of imagePresets) {
    prompts[preset.id] = preset.promptTemplate;
    if (preset.coverImageUrl) coverImageUrlByMode[preset.id] = preset.coverImageUrl;
    else delete coverImageUrlByMode[preset.id];
    if (preset.refSlotHints.length > 0) refSlotHintsByMode[preset.id] = preset.refSlotHints;
    else delete refSlotHintsByMode[preset.id];
    customModes.push({ ...(existingCustomModeById.get(preset.id) ?? {}), id: preset.id, label: preset.title });
    promptTagsByMode[preset.id] = normalizePromptTags(preset.tags);
    if (preset.description?.trim()) promptDescriptionsByMode[preset.id] = preset.description.trim();
    else delete promptDescriptionsByMode[preset.id];
  }

  return { ...workspace, prompts, coverImageUrlByMode, refSlotHintsByMode, customModes, promptTagsByMode, promptDescriptionsByMode };
}

export function applyPromptLibraryToVideoWorkspace(
  workspace: VideoWorkspaceSettings,
  presets: SitePromptPreset[],
): VideoWorkspaceSettings {
  const videoPresets = presets.filter((preset) => preset.kind === "video").sort(comparePresetAddedAscending);
  if (videoPresets.length === 0) return workspace;

  const prompts = { ...workspace.prompts };
  const coverImageUrlByMode = { ...workspace.coverImageUrlByMode };
  const existingCustomModeById = new Map(workspace.customModes.map((mode) => [mode.id, mode]));
  const presetIds = new Set(videoPresets.map((preset) => preset.id));
  const customModes = workspace.customModes.filter((mode) => !presetIds.has(mode.id));
  const promptTagsByMode = { ...workspace.promptTagsByMode };
  const promptDescriptionsByMode = { ...workspace.promptDescriptionsByMode };

  for (const preset of videoPresets) {
    prompts[preset.id] = preset.promptTemplate;
    if (preset.coverImageUrl) coverImageUrlByMode[preset.id] = preset.coverImageUrl;
    else delete coverImageUrlByMode[preset.id];
    customModes.push({ ...(existingCustomModeById.get(preset.id) ?? {}), id: preset.id, label: preset.title });
    promptTagsByMode[preset.id] = normalizePromptTags(preset.tags);
    if (preset.description?.trim()) promptDescriptionsByMode[preset.id] = preset.description.trim();
    else delete promptDescriptionsByMode[preset.id];
  }

  return { ...workspace, prompts, coverImageUrlByMode, customModes, promptTagsByMode, promptDescriptionsByMode };
}

export async function replaceSitePromptPresetsByKind(
  supabase: SupabaseClient,
  kind: PromptPresetKind,
  presets: SitePromptPreset[],
): Promise<void> {
  const rows = presets.map((preset, index) => toPresetRow(kind, preset, index));

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

export async function deleteSitePromptPreset(supabase: SupabaseClient, presetId: string): Promise<void> {
  const id = presetId.trim();
  if (!id) return;
  const { error } = await supabase.from("site_prompt_presets").delete().eq("id", id);
  if (error && !isMissingPresetTable(error)) throw error;
}

export async function upsertSitePromptPreset(
  supabase: SupabaseClient,
  kind: PromptPresetKind,
  preset: SitePromptPreset,
): Promise<SitePromptPreset> {
  const { data: firstRows, error: firstError } = await supabase
    .from("site_prompt_presets")
    .select("sort_order")
    .eq("preset_type", kind)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (firstError) {
    if (isMissingPresetTable(firstError)) return preset;
    throw firstError;
  }

  const firstSortOrder = Number((firstRows?.[0] as { sort_order?: unknown } | undefined)?.sort_order ?? 0);
  const sortOrder = Number.isFinite(firstSortOrder) ? firstSortOrder - 1 : -1;
  const normalizedPreset: SitePromptPreset = {
    ...preset,
    kind,
    title: preset.title.trim() || preset.id,
    promptTemplate: preset.promptTemplate ?? "",
    coverImageUrl: preset.coverImageUrl?.trim() || "",
    refSlotHints: kind === "image" ? (preset.refSlotHints ?? []) : [],
    tags: normalizePromptTags(preset.tags),
    description: preset.description?.trim() || undefined,
  };

  const { error } = await supabase.from("site_prompt_presets").upsert([toPresetRow(kind, normalizedPreset, sortOrder)], {
    onConflict: "id",
  });
  if (error) {
    if (isMissingPresetTable(error)) return normalizedPreset;
    throw error;
  }

  return normalizedPreset;
}

export async function createPromptPresetSubmission(
  supabase: SupabaseClient,
  kind: PromptPresetKind,
  preset: SitePromptPreset,
  submitter: { userId: string; email?: string | null },
): Promise<PromptPresetSubmission> {
  const id = preset.id.trim() || newPromptPresetSubmissionId(kind);
  const now = new Date().toISOString();
  const row = {
    id,
    preset_type: kind,
    title: preset.title.trim() || id,
    description: preset.description?.trim() || null,
    prompt_template: preset.promptTemplate ?? "",
    cover_image_url: preset.coverImageUrl?.trim() || null,
    ref_slot_hints: kind === "image" ? (preset.refSlotHints ?? []) : [],
    tags: normalizePromptTags(preset.tags),
    submitter_user_id: submitter.userId,
    submitter_email: submitter.email?.trim().toLowerCase() || null,
    status: "pending",
    published_preset_id: null,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("site_prompt_preset_submissions")
    .insert(row)
    .select(
      "id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, tags, description, submitter_user_id, submitter_email, status, published_preset_id, review_note, created_at, updated_at, reviewed_at",
    )
    .single();

  if (error) throw error;
  return rowToSubmission(data as PromptPresetSubmissionRow);
}

export async function listPromptPresetSubmissions(
  supabase: SupabaseClient,
  status: PromptPresetSubmissionStatus | "all" = "pending",
): Promise<PromptPresetSubmission[]> {
  let query = supabase
    .from("site_prompt_preset_submissions")
    .select(
      "id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, tags, description, submitter_user_id, submitter_email, status, published_preset_id, review_note, created_at, updated_at, reviewed_at",
    )
    .order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToSubmission(row as PromptPresetSubmissionRow));
}

export async function getPromptPresetSubmission(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<PromptPresetSubmission | null> {
  const { data, error } = await supabase
    .from("site_prompt_preset_submissions")
    .select(
      "id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, tags, description, submitter_user_id, submitter_email, status, published_preset_id, review_note, created_at, updated_at, reviewed_at",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSubmission(data as PromptPresetSubmissionRow) : null;
}

export async function markPromptPresetSubmissionReviewed(
  supabase: SupabaseClient,
  submissionId: string,
  review: {
    status: "approved" | "rejected";
    reviewedBy: string;
    publishedPresetId?: string;
    reviewNote?: string;
  },
): Promise<PromptPresetSubmission> {
  const { data, error } = await supabase
    .from("site_prompt_preset_submissions")
    .update({
      status: review.status,
      published_preset_id: review.publishedPresetId ?? null,
      review_note: review.reviewNote?.trim() || null,
      reviewed_by: review.reviewedBy,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .select(
      "id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, tags, description, submitter_user_id, submitter_email, status, published_preset_id, review_note, created_at, updated_at, reviewed_at",
    )
    .single();
  if (error) throw error;
  return rowToSubmission(data as PromptPresetSubmissionRow);
}

function imageWorkspaceRows(workspace: ImageWorkspaceSettings): Array<Record<string, unknown>> {
  return workspace.customModes.map((mode, index) =>
    toPresetRow(
      "image",
      {
        id: mode.id,
        kind: "image",
        title: mode.label.trim() || mode.id,
        promptTemplate: workspace.prompts[mode.id] ?? "",
        coverImageUrl: workspace.coverImageUrlByMode[mode.id] || "",
        refSlotHints: workspace.refSlotHintsByMode[mode.id] ?? [],
        tags: workspace.promptTagsByMode?.[mode.id] ?? [],
        description: workspace.promptDescriptionsByMode?.[mode.id],
      },
      index,
    ),
  );
}

function videoWorkspaceRows(workspace: VideoWorkspaceSettings): Array<Record<string, unknown>> {
  return workspace.customModes.map((mode, index) =>
    toPresetRow(
      "video",
      {
        id: mode.id,
        kind: "video",
        title: mode.label.trim() || mode.id,
        promptTemplate: workspace.prompts[mode.id] ?? "",
        coverImageUrl: workspace.coverImageUrlByMode[mode.id] || "",
        refSlotHints: [],
        tags: workspace.promptTagsByMode?.[mode.id] ?? [],
        description: workspace.promptDescriptionsByMode?.[mode.id],
      },
      index,
    ),
  );
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

  const deleteQuery = supabase
    .from("site_prompt_presets")
    .delete()
    .in("preset_type", ["image", "video"])
    .like("id", "custom_%");
  const { error: deleteError } =
    wantedIds.length === 0
      ? await deleteQuery
      : await deleteQuery.not("id", "in", `(${wantedIds.map((id) => quoteForSupabaseIn(id)).join(",")})`);

  if (deleteError && !isMissingPresetTable(deleteError)) throw deleteError;
}
