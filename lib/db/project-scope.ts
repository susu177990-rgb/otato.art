export type ProjectScope = {
  projectId?: string | null;
};

export type ProjectPageCursor = {
  timestamp: string;
  id: string;
};

export type ProjectPageOptions = ProjectScope & {
  limit?: number;
  cursor?: ProjectPageCursor | null;
};

export type ProjectPage<T> = {
  items: T[];
  nextCursor: ProjectPageCursor | null;
};

export function normalizeProjectId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const projectId = value.trim();
  return projectId || undefined;
}

export function normalizePageLimit(value: number | undefined, fallback: number, maximum = 100): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), 1), maximum);
}

export function applyProjectScope<T>(query: T, scope: ProjectScope): T {
  const scoped = query as T & {
    eq(column: string, value: string): T;
    is(column: string, value: null): T;
  };
  if (scope.projectId === null) return scoped.is("project_id", null);
  if (scope.projectId) return scoped.eq("project_id", scope.projectId);
  return query;
}

export function projectIdFromRequest(req: Request, bodyProjectId?: unknown): string | null | undefined {
  const bodyValue = normalizeProjectId(bodyProjectId);
  if (bodyValue !== undefined) return bodyValue;
  return normalizeProjectId(new URL(req.url).searchParams.get("projectId"));
}
