import { describe, expect, it } from "vitest";
import legacyProjectJson from "@/fixtures/projects/legacy-script-project.json";
import { ensureProjectCreativeDirection } from "@/lib/creative-directions";
import { migrateStage5To7 } from "@/lib/project-migrate";
import type { Project } from "@/lib/types";

function legacyProject(): Project {
  return structuredClone(legacyProjectJson) as Project;
}

describe("legacy script Project JSON compatibility", () => {
  it("loads an old Project JSON without requiring newly introduced optional fields", () => {
    const project = legacyProject();

    expect(project.id).toBe("legacy-script-001");
    expect(project.messages[0]?.content).toBe("继续写第五阶段");
    expect(project.meta).toBeUndefined();
    expect(project.sourceMaterials).toBeUndefined();
    expect(project.onboardingStatus).toBeUndefined();
  });

  it("moves the legacy stage-5 screenplay to stage 7 and preserves its content", () => {
    const project = legacyProject();

    expect(migrateStage5To7(project)).toBe(true);
    expect(project.currentStage).toBe(7);
    expect(project.maxApprovedStage).toBe(4);
    expect(project.artifacts).toEqual([
      expect.objectContaining({
        stage: 7,
        subKey: "episode-1",
        content: "旧版第五阶段分集剧本",
      }),
    ]);
  });

  it("applies compatibility migrations idempotently", () => {
    const project = legacyProject();

    expect(migrateStage5To7(project)).toBe(true);
    const migrated = structuredClone(project);
    expect(migrateStage5To7(project)).toBe(false);
    expect(project).toEqual(migrated);
  });

  it("assigns the default creative direction without discarding legacy data", () => {
    const project = legacyProject();
    const originalArtifacts = structuredClone(project.artifacts);

    expect(ensureProjectCreativeDirection(project)).toBe(true);
    expect(project.creativeDirectionId).toBeTruthy();
    expect(project.artifacts).toEqual(originalArtifacts);
  });
});
