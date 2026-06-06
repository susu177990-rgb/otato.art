import fs from "fs";
import path from "path";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { normalizeLlmSettings } from "@/lib/llm-models";
import { mergeImageSettings, type ImageWorkspaceSettings } from "@/lib/image-workspace";

/** 仓库根目录下的项目级设置（可提交 Git；换浏览器/换机器后仍以仓库为准） */
export const WORKSPACE_SETTINGS_BASENAME = "workspace-settings.json";

export interface WorkspaceSettingsFileV1 {
  version: 1;
  llm?: Partial<Settings>;
  imageWorkspace?: unknown;
}

export function workspaceSettingsPath(): string {
  return path.join(process.cwd(), WORKSPACE_SETTINGS_BASENAME);
}

export function mergeLlmFromWorkspaceFile(partial: Partial<Settings> | undefined): Settings {
  return normalizeLlmSettings(partial ?? DEFAULT_SETTINGS);
}

export function parseWorkspaceSettingsFile(raw: string): WorkspaceSettingsFileV1 | null {
  try {
    const j = JSON.parse(raw) as WorkspaceSettingsFileV1;
    if (j?.version !== 1) return null;
    return j;
  } catch {
    return null;
  }
}

export function readWorkspaceSettingsFromDisk(): WorkspaceSettingsFileV1 | null {
  try {
    const raw = fs.readFileSync(workspaceSettingsPath(), "utf8");
    return parseWorkspaceSettingsFile(raw);
  } catch {
    return null;
  }
}

/** 文件内容 + 源码默认合并后的快照（用于 SSR 注入与 GET API） */
export function getMergedWorkspaceSnapshot(): { llm: Settings; imageWorkspace: ImageWorkspaceSettings } {
  const file = readWorkspaceSettingsFromDisk();
  const llm = mergeLlmFromWorkspaceFile(file?.llm);
  const imageWorkspace = mergeImageSettings(file?.imageWorkspace ?? {});
  return { llm, imageWorkspace };
}

export function canWriteWorkspaceSettingsFile(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ALLOW_WORKSPACE_SETTINGS_WRITE === "1";
}

export function writeWorkspaceSettingsToDisk(payload: WorkspaceSettingsFileV1): void {
  fs.writeFileSync(workspaceSettingsPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
