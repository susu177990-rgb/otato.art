export const PROJECT_MODES = [
  { id: "overview", label: "总览", description: "查看项目状态与继续创作入口" },
  { id: "workspace", label: "工作台", description: "在对话、生图和视频模式间快速切换" },
  { id: "script", label: "剧本", description: "进入项目编剧室" },
  { id: "canvas", label: "画布", description: "整理素材、分镜与关系" },
] as const;

export type ProjectModeId = (typeof PROJECT_MODES)[number]["id"];

const PROJECT_MODE_IDS = new Set<ProjectModeId>(PROJECT_MODES.map((mode) => mode.id));

export function projectModeHref(projectId: string, mode: ProjectModeId): string {
  const encodedId = encodeURIComponent(projectId);
  if (mode === "overview") return `/projects/${encodedId}`;
  if (mode === "workspace") return `/projects/${encodedId}/workspace/chat`;
  return `/projects/${encodedId}/${mode}`;
}

export function projectModeFromPathname(pathname: string, projectId: string): ProjectModeId {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const segment = pathname.slice(base.length).split("/").filter(Boolean)[0];
  return segment && PROJECT_MODE_IDS.has(segment as ProjectModeId)
    ? (segment as ProjectModeId)
    : "overview";
}
