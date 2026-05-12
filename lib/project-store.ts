import fs from "fs";
import path from "path";
import type { Artifact, Project, ProjectSummary } from "./types";
import { resolveDataProjectsDir } from "./agent-paths";

const DATA_DIR = resolveDataProjectsDir();

/**
 * Lazy-migrate old projects where STAGE 5 was "分集剧本".
 * Now STAGE 5 = 设定集, STAGE 6 = 分集大纲, STAGE 7 = 分集剧本.
 * Returns true if the project was mutated and should be persisted.
 */
function migrateStage5To7(project: Project): boolean {
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

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export function listProjects(): ProjectSummary[] {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const summaries: ProjectSummary[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
      const p: Project = JSON.parse(raw);
      summaries.push({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        currentStage: p.currentStage,
        onboardingStatus: p.onboardingStatus,
        originMode: p.originMode,
      });
    } catch {
      // skip corrupt files
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

export function getProject(id: string): Project | null {
  ensureDir();
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    const project: Project = JSON.parse(fs.readFileSync(fp, "utf-8"));
    if (migrateStage5To7(project)) {
      fs.writeFileSync(fp, JSON.stringify(project, null, 2), "utf-8");
    }
    return project;
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  ensureDir();
  project.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath(project.id), JSON.stringify(project, null, 2), "utf-8");
}

export function deleteProject(id: string): boolean {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}
