export function buildProjectScriptHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/script`;
}
