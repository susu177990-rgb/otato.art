import fs from "fs";
import path from "path";
import { resolveAgentRoot } from "./agent-paths";
import { getCreativeDirection, normalizeCreativeDirectionId } from "./creative-directions";

const AGENT_ROOT = resolveAgentRoot();
const SCRIPT_AGENT_ROOT = path.join(AGENT_ROOT, "agent", "script-agent");
const LEGACY_ROOT = path.join(SCRIPT_AGENT_ROOT, "legacy");

const LEGACY_ORDERED_FILES = [
  "prompts/main_prompt.md",
  "prompts/main-agent-role.md",
  "prompts/rule.md",
  "prompts/deliverable-markdown.md",
  "prompts/skill.md",
  "prompts/flowchart.md",
  "prompts/script-planning-agent-role.md",
  "prompts/lines-agent-role.md",
  "prompts/english-lines-agent-role.md",
  "context_assets/character_reference.md",
];

const LEGACY_TEMPLATES_DIR = path.join(LEGACY_ROOT, "templates");
const LEGACY_KNOWLEDGE_DIR = path.join(LEGACY_ROOT, "knowledge");
const LEGACY_SKILLS_DIR = path.join(LEGACY_ROOT, "skills");
const KNOWLEDGE_EXCLUDE = new Set(["00_README.md"]);
const CORE_MANIFEST_PATH = "core/core-manifest.json";
const GENERAL_DIRECTION_ID = "general-screenplay";
const BL_DIRECTION_ID = "bl-short-drama";

export type SystemPromptCoreMode = "off" | "shadow-preview";
export type SystemPromptDirectionMode = "stable" | "shadow-preview";
export type SystemPromptAssemblyMode = "legacy" | "modular";

export interface LoadSystemPromptOptions {
  assemblyMode?: SystemPromptAssemblyMode;
  coreMode?: SystemPromptCoreMode;
  directionMode?: SystemPromptDirectionMode;
  additionalSharedPromptFiles?: string[];
}

interface CoreManifestModule {
  id?: string;
  path?: string;
}

interface CoreManifest {
  modules?: CoreManifestModule[];
}

function scriptAgentFile(relPath: string): string {
  return `agent/script-agent/${relPath}`;
}

function readFile(relPath: string): string {
  const abs = path.join(SCRIPT_AGENT_ROOT, relPath);
  try {
    return fs.readFileSync(abs, "utf-8");
  } catch {
    console.warn(`[prompt-loader] skip missing file: ${abs}`);
    return "";
  }
}

function readLegacyFile(relPath: string): string {
  const abs = path.join(LEGACY_ROOT, relPath);
  try {
    return fs.readFileSync(abs, "utf-8");
  } catch {
    console.warn(`[prompt-loader] skip missing legacy file: ${abs}`);
    return "";
  }
}

function readLegacyTemplates(): string {
  try {
    const files = fs.readdirSync(LEGACY_TEMPLATES_DIR).filter((f) => f.endsWith(".md"));
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(LEGACY_TEMPLATES_DIR, f), "utf-8");
        return `\n---\n<!-- template: ${scriptAgentFile(`templates/${f}`)} -->\n${content}`;
      })
      .join("\n");
  } catch {
    console.warn(`[prompt-loader] legacy templates dir not found: ${LEGACY_TEMPLATES_DIR}`);
    return "";
  }
}

function readLegacyKnowledge(): string {
  try {
    const files = fs
      .readdirSync(LEGACY_KNOWLEDGE_DIR)
      .filter((f) => f.endsWith(".md") && !KNOWLEDGE_EXCLUDE.has(f))
      .sort((a, b) => a.localeCompare(b, "en"));
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(LEGACY_KNOWLEDGE_DIR, f), "utf-8");
        return `<!-- file: agent/script-agent/knowledge/${f} -->\n${content}`;
      })
      .join("\n\n");
  } catch {
    console.warn(`[prompt-loader] legacy knowledge dir missing or unreadable: ${LEGACY_KNOWLEDGE_DIR}`);
    return "";
  }
}

function readLegacySkills(): string {
  try {
    const files = fs
      .readdirSync(LEGACY_SKILLS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, "en"));
    return files
      .map((f) => {
        const content = fs.readFileSync(path.join(LEGACY_SKILLS_DIR, f), "utf-8");
        return `<!-- file: agent/script-agent/skills/${f} -->\n${content}`;
      })
      .join("\n\n");
  } catch {
    console.warn(`[prompt-loader] legacy skills dir missing or unreadable: ${LEGACY_SKILLS_DIR}`);
    return "";
  }
}

const systemPromptCache = new Map<string, string>();
let planningCached: string | null = null;
let generalPlanningCached: string | null = null;
let adaptationAnalyzeCached: string | null = null;
let adaptationDiscussCached: string | null = null;
let adaptationPlannerCached: string | null = null;
let generalAdaptationPlannerCached: string | null = null;
let seriesBibleGeneratorCached: string | null = null;
let prefillMetaCached: string | null = null;

function readDirectionPrompts(creativeDirectionId?: string | null): string {
  const direction = getCreativeDirection(creativeDirectionId);
  return direction.promptFiles
    .map((relPath) => {
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- direction: ${direction.id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readLegacyDirectionPrompts(creativeDirectionId?: string | null): string {
  const direction = getCreativeDirection(creativeDirectionId);
  const promptFiles =
    direction.legacyPromptFiles && direction.legacyPromptFiles.length > 0
      ? direction.legacyPromptFiles
      : direction.promptFiles;
  return promptFiles
    .map((relPath) => {
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- direction: ${direction.id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readSharedPrompts(creativeDirectionId?: string | null, additionalSharedPromptFiles?: string[]): string {
  const direction = getCreativeDirection(creativeDirectionId);
  const files = [...(direction.sharedPromptFiles ?? []), ...(additionalSharedPromptFiles ?? [])];
  return files
    .map((relPath) => {
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- shared: ${direction.id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readDirectionTemplates(creativeDirectionId?: string | null): string {
  const direction = getCreativeDirection(creativeDirectionId);
  return (direction.templateFiles ?? [])
    .map((relPath) => {
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- direction-template: ${direction.id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readDirectionShadowPrompts(creativeDirectionId?: string | null): string {
  const direction = getCreativeDirection(creativeDirectionId);
  return (direction.migrationShadowPromptFiles ?? [])
    .map((relPath) => {
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- direction-shadow: ${direction.id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readCoreManifest(): CoreManifest | null {
  const raw = readFile(CORE_MANIFEST_PATH);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CoreManifest;
    return parsed && Array.isArray(parsed.modules) ? parsed : null;
  } catch {
    console.warn(`[prompt-loader] invalid core manifest JSON: ${scriptAgentFile(CORE_MANIFEST_PATH)}`);
    return null;
  }
}

function readCoreShadowPrompts(): string {
  const manifest = readCoreManifest();
  if (!manifest) return "";
  const modules = manifest.modules ?? [];

  return modules
    .map((mod) => {
      const id = mod.id?.trim();
      const relPath = mod.path?.trim();
      if (!id || !relPath) return "";
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- core-shadow: ${id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function readCoreStablePrompts(): string {
  const manifest = readCoreManifest();
  if (!manifest) return "";
  const modules = manifest.modules ?? [];

  return modules
    .map((mod) => {
      const id = mod.id?.trim();
      const relPath = mod.path?.trim();
      if (!id || !relPath) return "";
      const content = readFile(relPath);
      if (!content) return "";
      return `<!-- core-stable: ${id}; file: ${scriptAgentFile(relPath)} -->\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function isGeneralDirection(creativeDirectionId?: string | null): boolean {
  return normalizeCreativeDirectionId(creativeDirectionId) === GENERAL_DIRECTION_ID;
}

function resolveAssemblyMode(
  normalizedDirectionId: string,
  options?: LoadSystemPromptOptions
): SystemPromptAssemblyMode {
  if (options?.assemblyMode) return options.assemblyMode;
  if (options?.coreMode === "shadow-preview" || options?.directionMode === "shadow-preview") {
    return "legacy";
  }
  if (
    normalizedDirectionId === BL_DIRECTION_ID &&
    process.env.SCRIPT_AGENT_FORCE_LEGACY_BL === "1"
  ) {
    return "legacy";
  }
  return "modular";
}

/** 策划会话专用：轻量系统提示，不含全量 knowledge/templates */
export function loadPlanningSessionPrompt(creativeDirectionId?: string | null): string {
  if (isGeneralDirection(creativeDirectionId)) {
    if (generalPlanningCached) return generalPlanningCached;
    const p = readFile("directions/general-screenplay/prompts/planning.md");
    generalPlanningCached = p
      ? `<!-- direction-planning: general-screenplay; file: ${scriptAgentFile("directions/general-screenplay/prompts/planning.md")} -->\n${p}`
      : "";
    return generalPlanningCached;
  }

  if (planningCached) return planningCached;
  const parts: string[] = [];
  const p1 = readFile("directions/bl-short-drama/prompts/planning.md");
  if (p1) parts.push(`<!-- direction-planning: bl-short-drama; file: ${scriptAgentFile("directions/bl-short-drama/prompts/planning.md")} -->\n${p1}`);
  planningCached = parts.join("\n\n");
  return planningCached;
}

/** 改编：单次原文分析（不含全量 knowledge） */
export function loadAdaptationAnalyzePrompt(): string {
  if (adaptationAnalyzeCached) return adaptationAnalyzeCached;
  const p = readFile("shared/adaptation/workflow.md");
  adaptationAnalyzeCached = p ? `<!-- shared: adaptation; file: ${scriptAgentFile("shared/adaptation/workflow.md")} -->\n${p}` : "";
  return adaptationAnalyzeCached;
}

/** 改编：改编策略讨论会话 */
export function loadAdaptationDiscussPrompt(): string {
  if (adaptationDiscussCached) return adaptationDiscussCached;
  const p = readFile("shared/adaptation/workflow.md");
  adaptationDiscussCached = p ? `<!-- shared: adaptation; file: ${scriptAgentFile("shared/adaptation/workflow.md")} -->\n${p}` : "";
  return adaptationDiscussCached;
}

/** 改编：规划师阶段（与 script-planning-agent-role 组合） */
export function loadAdaptationPlannerPrompt(creativeDirectionId?: string | null): string {
  if (isGeneralDirection(creativeDirectionId)) {
    if (generalAdaptationPlannerCached) return generalAdaptationPlannerCached;
    const p = readFile("directions/general-screenplay/prompts/adaptation-planner.md");
    generalAdaptationPlannerCached = p
      ? `<!-- direction-planning: general-screenplay; file: ${scriptAgentFile("directions/general-screenplay/prompts/adaptation-planner.md")} -->\n${p}`
      : "";
    return generalAdaptationPlannerCached;
  }

  if (adaptationPlannerCached) return adaptationPlannerCached;
  const parts: string[] = [];
  const p1 = readFile("directions/bl-short-drama/prompts/adaptation-planner.md");
  if (p1) parts.push(`<!-- direction-planning: bl-short-drama; file: ${scriptAgentFile("directions/bl-short-drama/prompts/adaptation-planner.md")} -->\n${p1}`);
  const p2 = readFile("shared/adaptation/workflow.md");
  if (p2) parts.push(`<!-- shared: adaptation; file: ${scriptAgentFile("shared/adaptation/workflow.md")} -->\n${p2}`);
  adaptationPlannerCached = parts.join("\n\n");
  return adaptationPlannerCached;
}

/** 进编剧室前：由确认书生成项目级系列圣经 */
export function loadSeriesBibleGeneratorPrompt(): string {
  if (seriesBibleGeneratorCached) return seriesBibleGeneratorCached;
  const p = readFile("core/prompts/series-bible-generator.md");
  seriesBibleGeneratorCached = p ? `<!-- core-stable: series-bible-generator; file: ${scriptAgentFile("core/prompts/series-bible-generator.md")} -->\n${p}` : "";
  return seriesBibleGeneratorCached;
}

/** 立项元数据 JSON 抽取 */
export function loadPrefillMetaPrompt(): string {
  if (prefillMetaCached) return prefillMetaCached;
  const p = readFile("core/prompts/prefill-meta.md");
  prefillMetaCached = p ? `<!-- core-stable: prefill-meta; file: ${scriptAgentFile("core/prompts/prefill-meta.md")} -->\n${p}` : "";
  return prefillMetaCached;
}

export function loadSystemPrompt(
  creativeDirectionId?: string | null,
  options?: LoadSystemPromptOptions
): string {
  const normalizedDirectionId = normalizeCreativeDirectionId(creativeDirectionId);
  const assemblyMode = resolveAssemblyMode(normalizedDirectionId, options);
  const coreMode = options?.coreMode ?? "off";
  const directionMode = options?.directionMode ?? "stable";
  const additionalSharedPromptFiles = options?.additionalSharedPromptFiles ?? [];
  const additionalSharedKey = additionalSharedPromptFiles.join(",");
  const cacheKey =
    assemblyMode === "legacy" && coreMode === "off" && directionMode === "stable" && !additionalSharedKey
      ? `${normalizedDirectionId}:legacy`
      : `${normalizedDirectionId}:assembly=${assemblyMode}:core=${coreMode}:direction=${directionMode}:shared=${additionalSharedKey}`;
  const cached = systemPromptCache.get(cacheKey);
  if (cached) return cached;

  const parts: string[] = [];

  if (assemblyMode === "modular") {
    const coreStablePrompts = readCoreStablePrompts();
    if (coreStablePrompts) {
      parts.push(coreStablePrompts);
    }

    const sharedPrompts = readSharedPrompts(normalizedDirectionId, additionalSharedPromptFiles);
    if (sharedPrompts) {
      parts.push(sharedPrompts);
    }

    const directionPrompts = readDirectionPrompts(normalizedDirectionId);
    if (directionPrompts) {
      parts.push(directionPrompts);
    }

    const directionTemplates = readDirectionTemplates(normalizedDirectionId);
    if (directionTemplates) {
      parts.push(directionTemplates);
    }

    const joined = parts.join("\n\n");
    systemPromptCache.set(cacheKey, joined);
    return joined;
  }

  for (const rel of LEGACY_ORDERED_FILES) {
    const content = readLegacyFile(rel);
    if (content) {
      parts.push(`<!-- file: ${scriptAgentFile(rel)} -->\n${content}`);
    }
  }

  if (coreMode === "shadow-preview") {
    const coreShadowPrompts = readCoreShadowPrompts();
    if (coreShadowPrompts) {
      parts.push(coreShadowPrompts);
    }
  }

  const directionPrompts = readLegacyDirectionPrompts(normalizedDirectionId);
  if (directionPrompts) {
    parts.push(directionPrompts);
  }

  if (directionMode === "shadow-preview") {
    const directionShadowPrompts = readDirectionShadowPrompts(normalizedDirectionId);
    if (directionShadowPrompts) {
      parts.push(directionShadowPrompts);
    }
  }

  const knowledge = readLegacyKnowledge();
  if (knowledge) {
    parts.push(knowledge);
  }

  const skills = readLegacySkills();
  if (skills) {
    parts.push(skills);
  }

  const templates = readLegacyTemplates();
  if (templates) {
    parts.push(templates);
  }

  const joined = parts.join("\n\n");
  systemPromptCache.set(cacheKey, joined);
  return joined;
}
