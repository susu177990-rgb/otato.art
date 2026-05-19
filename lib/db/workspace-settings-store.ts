import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_IMAGE_SETTINGS, mergeImageSettings, type ImageWorkspaceSettings } from "@/lib/image-workspace";
import { normalizeModel } from "@/lib/model-presets";
import { pickNonEmptyTrimmed } from "@/lib/persisted-field";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

export type WorkspaceSnapshot = {
  llm: Settings;
  imageWorkspace: ImageWorkspaceSettings;
};

function mergeLlmPartial(partial: unknown): Settings {
  const m = partial && typeof partial === "object" ? (partial as Partial<Settings>) : {};
  return {
    apiUrl: pickNonEmptyTrimmed(m.apiUrl, DEFAULT_SETTINGS.apiUrl),
    apiKey: pickNonEmptyTrimmed(m.apiKey, DEFAULT_SETTINGS.apiKey),
    model: normalizeModel(pickNonEmptyTrimmed(m.model, DEFAULT_SETTINGS.model)),
  };
}

export async function getWorkspaceSnapshot(supabase: SupabaseClient): Promise<WorkspaceSnapshot> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("llm, image_workspace")
    .eq("id", "global")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      llm: mergeLlmPartial(undefined),
      imageWorkspace: mergeImageSettings({}),
    };
  }

  return {
    llm: mergeLlmPartial(data.llm),
    imageWorkspace: mergeImageSettings(data.image_workspace ?? {}),
  };
}

export async function upsertWorkspaceSnapshot(
  supabase: SupabaseClient,
  snapshot: { llm?: Partial<Settings>; imageWorkspace?: unknown },
): Promise<WorkspaceSnapshot> {
  const llm = mergeLlmPartial(snapshot.llm);
  const imageWorkspace = mergeImageSettings(snapshot.imageWorkspace ?? DEFAULT_IMAGE_SETTINGS);

  const { error } = await supabase.from("site_settings").upsert(
    {
      id: "global",
      llm,
      image_workspace: imageWorkspace,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw error;

  return { llm, imageWorkspace };
}

/** 迁移脚本：写入全站共享配置 */
export async function upsertSiteWorkspaceSnapshot(
  supabase: SupabaseClient,
  snapshot: { llm?: Partial<Settings>; imageWorkspace?: unknown },
): Promise<void> {
  const llm = mergeLlmPartial(snapshot.llm);
  const imageWorkspace = mergeImageSettings(snapshot.imageWorkspace ?? {});

  const { error } = await supabase.from("site_settings").upsert(
    {
      id: "global",
      llm,
      image_workspace: imageWorkspace,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}
