import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_IMAGE_SETTINGS, mergeImageSettings, type ImageWorkspaceSettings } from "@/lib/image-workspace";
import { DEFAULT_VIDEO_SETTINGS, mergeVideoSettings, type VideoWorkspaceSettings } from "@/lib/video-workspace";
import {
  applyPromptLibraryToImageWorkspace,
  applyPromptLibraryToVideoWorkspace,
  listSitePromptPresets,
  syncPromptLibraryFromWorkspaces,
} from "@/lib/db/prompt-preset-store";
import { normalizeLlmSettings } from "@/lib/llm-models";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

export type WorkspaceSnapshot = {
  llm: Settings;
  imageWorkspace: ImageWorkspaceSettings;
  videoWorkspace: VideoWorkspaceSettings;
};

function mergeLlmPartial(partial: unknown): Settings {
  return normalizeLlmSettings(partial ?? DEFAULT_SETTINGS);
}

export async function getWorkspaceSnapshot(supabase: SupabaseClient): Promise<WorkspaceSnapshot> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("llm, image_workspace, video_workspace")
    .eq("id", "global")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const presets = await listSitePromptPresets(supabase);
    return {
      llm: mergeLlmPartial(undefined),
      imageWorkspace: applyPromptLibraryToImageWorkspace(mergeImageSettings({}), presets),
      videoWorkspace: applyPromptLibraryToVideoWorkspace(mergeVideoSettings({}), presets),
    };
  }

  const row = data as { llm?: unknown; image_workspace?: unknown; video_workspace?: unknown };
  const presets = await listSitePromptPresets(supabase);
  return {
    llm: mergeLlmPartial(row.llm),
    imageWorkspace: applyPromptLibraryToImageWorkspace(mergeImageSettings(row.image_workspace ?? {}), presets),
    videoWorkspace: applyPromptLibraryToVideoWorkspace(mergeVideoSettings(row.video_workspace ?? {}), presets),
  };
}

export async function upsertWorkspaceSnapshot(
  supabase: SupabaseClient,
  snapshot: { llm?: Partial<Settings>; imageWorkspace?: unknown; videoWorkspace?: unknown },
): Promise<WorkspaceSnapshot> {
  const current = await getWorkspaceSnapshot(supabase).catch(() => ({
    llm: DEFAULT_SETTINGS,
    imageWorkspace: DEFAULT_IMAGE_SETTINGS,
    videoWorkspace: DEFAULT_VIDEO_SETTINGS,
  }));
  const llm = mergeLlmPartial(snapshot.llm ?? current.llm);
  const imageWorkspace = mergeImageSettings(snapshot.imageWorkspace ?? current.imageWorkspace);
  const videoWorkspace = mergeVideoSettings(snapshot.videoWorkspace ?? current.videoWorkspace);

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

  await syncPromptLibraryFromWorkspaces(supabase, imageWorkspace, videoWorkspace);

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
  await syncPromptLibraryFromWorkspaces(supabase, imageWorkspace, videoWorkspace);
}
