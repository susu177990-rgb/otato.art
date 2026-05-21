import manifestRaw from "@/agent/script-agent/manifest.json";
import blDirectionRaw from "@/agent/script-agent/directions/bl-short-drama/direction.json";
import generalDirectionRaw from "@/agent/script-agent/directions/general-screenplay/direction.json";
import type { Project, ProjectMeta } from "./types";

export const DEFAULT_CREATIVE_DIRECTION_ID = "general-screenplay";
export const LEGACY_CREATIVE_DIRECTION_ID = "bl-short-drama";

export type CreativeDirectionStatus = "stable" | "beta" | "disabled";

export interface CreativeDirectionDefaults {
  episodeCount: string;
  episodeDurationMinutes: number | null;
  targetMarket: string;
  dialogueLanguage: string;
}

export interface CreativeDirection {
  id: string;
  label: string;
  shortLabel: string;
  status: CreativeDirectionStatus;
  description: string;
  defaults: CreativeDirectionDefaults;
  requiresEnglishLocaleBrief: boolean;
  contextSummary: string;
  legacyPromptFiles?: string[];
  sharedPromptFiles?: string[];
  promptFiles: string[];
  templateFiles?: string[];
  migrationShadowPromptFiles?: string[];
}

type AgentManifest = {
  defaultCreativeDirectionId?: string;
  directions?: Array<{ id?: string; configPath?: string }>;
};

const manifest = manifestRaw as AgentManifest;
const rawDirections = [generalDirectionRaw as CreativeDirection, blDirectionRaw as CreativeDirection];
const manifestDirectionIds = new Set((manifest.directions ?? []).map((d) => d.id).filter(Boolean));

const CREATIVE_DIRECTIONS = rawDirections
  .filter((d) => !manifestDirectionIds.size || manifestDirectionIds.has(d.id))
  .map((d) => ({
    ...d,
    legacyPromptFiles: Array.isArray(d.legacyPromptFiles) ? d.legacyPromptFiles : [],
    sharedPromptFiles: Array.isArray(d.sharedPromptFiles) ? d.sharedPromptFiles : [],
    promptFiles: Array.isArray(d.promptFiles) ? d.promptFiles : [],
    templateFiles: Array.isArray(d.templateFiles) ? d.templateFiles : [],
    migrationShadowPromptFiles: Array.isArray(d.migrationShadowPromptFiles)
      ? d.migrationShadowPromptFiles
      : [],
  }));

const DIRECTION_BY_ID = new Map(CREATIVE_DIRECTIONS.map((d) => [d.id, d]));

function manifestDefaultId(): string {
  const raw = manifest.defaultCreativeDirectionId?.trim();
  return raw && DIRECTION_BY_ID.has(raw) ? raw : DEFAULT_CREATIVE_DIRECTION_ID;
}

function fallbackDirectionId(fallbackId: string): string {
  return DIRECTION_BY_ID.has(fallbackId) ? fallbackId : manifestDefaultId();
}

export function listCreativeDirections(): CreativeDirection[] {
  return CREATIVE_DIRECTIONS.filter((d) => d.status !== "disabled");
}

export function normalizeCreativeDirectionId(id?: string | null): string {
  const raw = id?.trim();
  if (raw && DIRECTION_BY_ID.has(raw)) return raw;
  return manifestDefaultId();
}

export function normalizeExistingProjectCreativeDirectionId(id?: string | null): string {
  const raw = id?.trim();
  if (raw && DIRECTION_BY_ID.has(raw)) return raw;
  return fallbackDirectionId(LEGACY_CREATIVE_DIRECTION_ID);
}

export function getCreativeDirection(id?: string | null): CreativeDirection {
  const normalized = normalizeCreativeDirectionId(id);
  return DIRECTION_BY_ID.get(normalized) ?? DIRECTION_BY_ID.get(fallbackDirectionId(DEFAULT_CREATIVE_DIRECTION_ID))!;
}

export function getExistingProjectCreativeDirection(id?: string | null): CreativeDirection {
  const normalized = normalizeExistingProjectCreativeDirectionId(id);
  return DIRECTION_BY_ID.get(normalized) ?? DIRECTION_BY_ID.get(fallbackDirectionId(LEGACY_CREATIVE_DIRECTION_ID))!;
}

export function ensureProjectCreativeDirection(project: { creativeDirectionId?: string }): boolean {
  const normalized = normalizeExistingProjectCreativeDirectionId(project.creativeDirectionId);
  if (project.creativeDirectionId === normalized) return false;
  project.creativeDirectionId = normalized;
  return true;
}

export function applyCreativeDirectionDefaultsToMeta(
  meta: ProjectMeta,
  creativeDirectionId?: string | null,
): ProjectMeta {
  const defaults = getCreativeDirection(creativeDirectionId).defaults;
  return {
    ...meta,
    episodeCount: meta.episodeCount || defaults.episodeCount,
    episodeDurationMinutes: meta.episodeDurationMinutes ?? defaults.episodeDurationMinutes,
    targetMarket: meta.targetMarket || defaults.targetMarket,
    dialogueLanguage: meta.dialogueLanguage || defaults.dialogueLanguage,
  };
}

export function isCreativeDirectionLocked(
  project: Pick<
    Project,
    "onboardingStatus" | "creativeBrief" | "seriesBible" | "messages" | "artifacts"
  >,
): boolean {
  return Boolean(
    project.onboardingStatus == null ||
      project.onboardingStatus === "ready" ||
      (project.creativeBrief ?? "").trim() ||
      (project.seriesBible ?? "").trim() ||
      (project.messages?.length ?? 0) > 0 ||
      (project.artifacts?.length ?? 0) > 0,
  );
}

export function buildCreativeDirectionContext(creativeDirectionId?: string | null): string {
  const direction = getCreativeDirection(creativeDirectionId);
  const defaults = direction.defaults;
  const targetMarket = defaults.targetMarket || "由项目资料与主创选择决定";
  const episodeCount = defaults.episodeCount || "由项目资料与主创选择决定";
  const episodeDuration =
    defaults.episodeDurationMinutes == null
      ? "由项目资料与主创选择决定"
      : `单集约 ${defaults.episodeDurationMinutes} 分钟`;
  const dialogueLanguage = defaults.dialogueLanguage || "由项目资料与主创选择决定";
  return [
    `创作方向 ID：${direction.id}`,
    `创作方向名称：${direction.label}`,
    `方向状态：${direction.status}`,
    `方向定位：${direction.description}`,
    `默认目标市场：${targetMarket}`,
    `默认体量：${episodeCount}；${episodeDuration}`,
    `默认台词语言：${dialogueLanguage}`,
    `英语 Locale 简报：${direction.requiresEnglishLocaleBrief ? "需要，并在 STAGE 7 服从项目级简报" : "不强制"}`,
    `方向约束：${direction.contextSummary}`,
  ].join("\n");
}
