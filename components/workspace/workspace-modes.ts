export const WORKSPACE_MODES = ["chat", "image", "video"] as const;

export type WorkspaceMode = (typeof WORKSPACE_MODES)[number];

export type WorkspaceModeDefinition = {
  mode: WorkspaceMode;
  label: string;
};

export const WORKSPACE_MODE_DEFINITIONS: readonly WorkspaceModeDefinition[] = [
  { mode: "chat", label: "对话" },
  { mode: "image", label: "生图" },
  { mode: "video", label: "视频" },
];

export function isWorkspaceMode(value: string): value is WorkspaceMode {
  return WORKSPACE_MODES.some((mode) => mode === value);
}

export function buildProjectWorkspaceHref(projectId: string, mode: WorkspaceMode): string {
  return `/projects/${encodeURIComponent(projectId)}/workspace/${mode}`;
}
