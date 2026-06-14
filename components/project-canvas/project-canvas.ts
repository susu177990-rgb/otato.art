import type { CanvasBoard, CanvasBoardSummary } from "@/lib/canvas/types";
import type { Project } from "@/lib/types";

export type ProjectCanvasResolution = {
  board: CanvasBoard | CanvasBoardSummary;
  project: Project;
};

export type ProjectCanvasFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const pendingResolutions = new Map<string, Promise<ProjectCanvasResolution>>();

export function buildProjectCanvasDisplayTitle(project: Pick<Project, "name">): string {
  const name = project.name.trim() || "未命名项目";
  return `${name} · 主画布`;
}

export function findProjectCanvas(
  boards: readonly CanvasBoardSummary[],
  projectId: string,
): CanvasBoardSummary | undefined {
  return boards.find((board) => board.projectId === projectId) ?? boards[0];
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  return new Error(typeof data.error === "string" ? data.error : fallback);
}

async function resolveProjectCanvasBoardUncached(
  projectId: string,
  fetcher: ProjectCanvasFetch,
): Promise<ProjectCanvasResolution> {
  const [projectResponse, boardsResponse] = await Promise.all([
    fetcher(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" }),
    fetcher(`/api/canvas-boards?projectId=${encodeURIComponent(projectId)}`, {
      cache: "no-store",
    }),
  ]);

  if (!projectResponse.ok) throw await readError(projectResponse, "项目无法加载");
  if (!boardsResponse.ok) throw await readError(boardsResponse, "画布无法加载");

  const project = (await projectResponse.json()) as Project;
  const data = (await boardsResponse.json()) as { boards?: CanvasBoardSummary[] };
  const existing = findProjectCanvas(data.boards ?? [], projectId);
  if (existing) return { board: existing, project };

  const createResponse = await fetcher("/api/canvas-boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      title: buildProjectCanvasDisplayTitle(project),
    }),
  });
  if (!createResponse.ok) throw await readError(createResponse, "主画布创建失败");

  return {
    board: (await createResponse.json()) as CanvasBoard,
    project,
  };
}

export function resolveProjectCanvasBoard(
  projectId: string,
  fetcher: ProjectCanvasFetch = fetch,
): Promise<ProjectCanvasResolution> {
  const existing = pendingResolutions.get(projectId);
  if (existing) return existing;

  const pending = resolveProjectCanvasBoardUncached(projectId, fetcher).finally(() => {
    if (pendingResolutions.get(projectId) === pending) {
      pendingResolutions.delete(projectId);
    }
  });
  pendingResolutions.set(projectId, pending);
  return pending;
}
