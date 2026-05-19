import type { Artifact, Project } from "./types";

/**
 * Lazy-migrate old projects where STAGE 5 was "分集剧本".
 * Now STAGE 5 = 设定集, STAGE 6 = 分集大纲, STAGE 7 = 分集剧本.
 */
export function migrateStage5To7(project: Project): boolean {
  const raw = project as unknown as Record<string, unknown>;
  if (raw._migratedV2) return false;

  const arts = project.artifacts ?? [];
  const hadOldStage5 = arts.some((a: Artifact) => a.stage === 5);
  if (!hadOldStage5 && (project.currentStage ?? 0) < 5 && (project.maxApprovedStage ?? 0) < 5) {
    raw._migratedV2 = true;
    return true;
  }

  for (const a of arts) {
    if (a.stage === 5) a.stage = 7;
  }

  if (project.currentStage === 5) project.currentStage = 7;
  if ((project.maxApprovedStage ?? 0) >= 5) project.maxApprovedStage = 4;

  raw._migratedV2 = true;
  return true;
}
