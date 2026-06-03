import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_IMAGE_SETTINGS, mergeImageSettings, type ImageWorkspaceSettings } from "@/lib/image-workspace";
import { DEFAULT_VIDEO_SETTINGS, mergeVideoSettings, type VideoWorkspaceSettings } from "@/lib/video-workspace";
import { normalizeModel } from "@/lib/model-presets";
import { pickNonEmptyTrimmed } from "@/lib/persisted-field";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

export type WorkspaceSnapshot = {
  llm: Settings;
  imageWorkspace: ImageWorkspaceSettings;
  videoWorkspace: VideoWorkspaceSettings;
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
    .select("llm, image_workspace, video_workspace")
    .eq("id", "global")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      llm: mergeLlmPartial(undefined),
      imageWorkspace: mergeImageSettings({}),
      videoWorkspace: mergeVideoSettings({}),
    };
  }

  const row = data as { llm?: unknown; image_workspace?: unknown; video_workspace?: unknown };
  return {
    llm: mergeLlmPartial(row.llm),
    imageWorkspace: mergeImageSettings(row.image_workspace ?? {}),
    videoWorkspace: mergeVideoSettings(row.video_workspace ?? {}),
  };
}

export async function upsertWorkspaceSnapshot(
  supabase: SupabaseClient,
  snapshot: { llm?: Partial<Settings>; imageWorkspace?: unknown; videoWorkspace?: unknown },
): Promise<WorkspaceSnapshot> {
  const llm = mergeLlmPartial(snapshot.llm);
  const imageWorkspace = mergeImageSettings(snapshot.imageWorkspace ?? DEFAULT_IMAGE_SETTINGS);
  const videoWorkspace = mergeVideoSettings(snapshot.videoWorkspace ?? DEFAULT_VIDEO_SETTINGS);

  const { error } = await supabase.from("site_settings").upsert(
    {
      id: "global",
      llm,
      image_workspace: imageWorkspace,
      video_workspace: videoWorkspace,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw error;

  return { llm, imageWorkspace, videoWorkspace };
}

/** 迁移脚本：写入全站共享配置 */
export async function upsertSiteWorkspaceSnapshot(
  supabase: SupabaseClient,
  snapshot: { llm?: Partial<Settings>; imageWorkspace?: unknown; videoWorkspace?: unknown },
): Promise<void> {
  const llm = mergeLlmPartial(snapshot.llm);
  const imageWorkspace = mergeImageSettings(snapshot.imageWorkspace ?? {});
  const videoWorkspace = mergeVideoSettings(snapshot.videoWorkspace ?? {});

  const { error } = await supabase.from("site_settings").upsert(
    {
      id: "global",
      llm,
      image_workspace: imageWorkspace,
      video_workspace: videoWorkspace,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}
