import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadSystemPrompt } from "../lib/prompt-loader";

const DIRECTION_ID = "bl-short-drama";
const DIRECTION_CONFIG_PATH = "agent/script-agent/directions/bl-short-drama/direction.json";
const DIRECTION_PROFILE_MARKER =
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/profile.md -->";
const DIRECTION_SHADOW_MARKER = "<!-- migration-shadow:";
const DIRECTION_SHADOW_PROMPT_MARKER = "<!-- direction-shadow:";
const LEGACY_MARKER = "<!-- file: agent/script-agent/prompts/main_prompt.md -->";
const CORE_MARKER = "<!-- core-shadow:";
const KNOWLEDGE_MARKER = "<!-- file: agent/script-agent/knowledge/01_EPISODE_SPECS.md -->";
const SKILL_MARKER = "<!-- file: agent/script-agent/skills/00_INDEX.md -->";
const TEMPLATE_MARKER_PREFIX = "<!-- template: agent/script-agent/templates/";

interface DirectionConfig {
  legacyPromptFiles?: string[];
  promptFiles?: string[];
  migrationShadowPromptFiles?: string[];
}

function fail(message: string): never {
  throw new Error(`script-agent direction shadow failed: ${message}`);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function markerIndex(prompt: string, marker: string): number {
  const index = prompt.indexOf(marker);
  if (index < 0) fail(`missing marker: ${marker}`);
  return index;
}

const direction = JSON.parse(fs.readFileSync(DIRECTION_CONFIG_PATH, "utf8")) as DirectionConfig;
const promptFiles = new Set(direction.promptFiles ?? []);
const legacyPromptFiles = new Set(direction.legacyPromptFiles ?? []);
const shadowFiles = direction.migrationShadowPromptFiles ?? [];

if (shadowFiles.length === 0) {
  fail("migrationShadowPromptFiles is empty");
}

for (const relPath of shadowFiles) {
  if (promptFiles.has(relPath) && legacyPromptFiles.has(relPath)) {
    fail(`promoted shadow file must not be listed in legacyPromptFiles: ${relPath}`);
  }

  const absPath = `agent/script-agent/${relPath}`;
  if (!fs.existsSync(absPath)) {
    fail(`shadow file does not exist: ${absPath}`);
  }

  const content = fs.readFileSync(absPath, "utf8");
  if (!content.includes(DIRECTION_SHADOW_MARKER)) {
    fail(`shadow file missing migration marker: ${absPath}`);
  }
}

const productionPrompt = loadSystemPrompt(DIRECTION_ID);
const legacyPrompt = loadSystemPrompt(DIRECTION_ID, { assemblyMode: "legacy" });
const coreOnlyPreviewPrompt = loadSystemPrompt(DIRECTION_ID, {
  assemblyMode: "legacy",
  coreMode: "shadow-preview",
});
const directionOnlyPreviewPrompt = loadSystemPrompt(DIRECTION_ID, {
  assemblyMode: "legacy",
  directionMode: "shadow-preview",
});
const combinedPreviewPrompt = loadSystemPrompt(DIRECTION_ID, {
  assemblyMode: "legacy",
  coreMode: "shadow-preview",
  directionMode: "shadow-preview",
});

if (!productionPrompt.includes(DIRECTION_PROFILE_MARKER)) {
  fail("production prompt does not include loaded direction profile marker");
}

if (!legacyPrompt.includes(DIRECTION_PROFILE_MARKER)) {
  fail("legacy prompt does not include loaded direction profile marker");
}

if (!coreOnlyPreviewPrompt.includes(DIRECTION_PROFILE_MARKER)) {
  fail("core-only shadow-preview prompt does not include loaded direction profile marker");
}

if (!directionOnlyPreviewPrompt.includes(DIRECTION_PROFILE_MARKER)) {
  fail("direction-only shadow-preview prompt does not include loaded direction profile marker");
}

if (!combinedPreviewPrompt.includes(DIRECTION_PROFILE_MARKER)) {
  fail("combined shadow-preview prompt does not include loaded direction profile marker");
}

for (const relPath of shadowFiles) {
  const loadedPathMarker = `agent/script-agent/${relPath}`;
  const promptMarker = `<!-- direction-shadow: ${DIRECTION_ID}; file: ${loadedPathMarker} -->`;
  if (productionPrompt.includes(DIRECTION_SHADOW_PROMPT_MARKER)) {
    fail(`production prompt unexpectedly includes direction shadow marker: ${relPath}`);
  }
  if (legacyPrompt.includes(loadedPathMarker) || legacyPrompt.includes(DIRECTION_SHADOW_MARKER)) {
    fail(`legacy prompt unexpectedly includes direction shadow file: ${relPath}`);
  }
  if (
    coreOnlyPreviewPrompt.includes(loadedPathMarker) ||
    coreOnlyPreviewPrompt.includes(DIRECTION_SHADOW_MARKER) ||
    coreOnlyPreviewPrompt.includes(DIRECTION_SHADOW_PROMPT_MARKER)
  ) {
    fail(`core-only shadow-preview prompt unexpectedly includes direction shadow file: ${relPath}`);
  }
  if (!directionOnlyPreviewPrompt.includes(promptMarker)) {
    fail(`direction-only shadow-preview prompt missing direction shadow marker: ${relPath}`);
  }
  if (!combinedPreviewPrompt.includes(promptMarker)) {
    fail(`combined shadow-preview prompt missing direction shadow marker: ${relPath}`);
  }
}

const directionLegacyIndex = markerIndex(directionOnlyPreviewPrompt, LEGACY_MARKER);
const directionStableIndex = markerIndex(directionOnlyPreviewPrompt, DIRECTION_PROFILE_MARKER);
const directionShadowIndex = markerIndex(directionOnlyPreviewPrompt, DIRECTION_SHADOW_PROMPT_MARKER);
const directionKnowledgeIndex = markerIndex(directionOnlyPreviewPrompt, KNOWLEDGE_MARKER);
const directionSkillIndex = markerIndex(directionOnlyPreviewPrompt, SKILL_MARKER);
const directionTemplateIndex = markerIndex(directionOnlyPreviewPrompt, TEMPLATE_MARKER_PREFIX);

if (!(directionLegacyIndex < directionStableIndex && directionStableIndex < directionShadowIndex)) {
  fail("direction-only preview order must be legacy -> stable direction -> direction shadow");
}
if (
  !(
    directionShadowIndex < directionKnowledgeIndex &&
    directionKnowledgeIndex < directionSkillIndex &&
    directionSkillIndex < directionTemplateIndex
  )
) {
  fail("direction-only preview order must continue direction shadow -> knowledge -> skills -> templates");
}

const combinedLegacyIndex = markerIndex(combinedPreviewPrompt, LEGACY_MARKER);
const combinedCoreIndex = markerIndex(combinedPreviewPrompt, CORE_MARKER);
const combinedStableIndex = markerIndex(combinedPreviewPrompt, DIRECTION_PROFILE_MARKER);
const combinedShadowIndex = markerIndex(combinedPreviewPrompt, DIRECTION_SHADOW_PROMPT_MARKER);
const combinedKnowledgeIndex = markerIndex(combinedPreviewPrompt, KNOWLEDGE_MARKER);
const combinedSkillIndex = markerIndex(combinedPreviewPrompt, SKILL_MARKER);
const combinedTemplateIndex = markerIndex(combinedPreviewPrompt, TEMPLATE_MARKER_PREFIX);

if (!(combinedLegacyIndex < combinedCoreIndex && combinedCoreIndex < combinedStableIndex)) {
  fail("combined preview order must be legacy -> core shadow -> stable direction");
}
if (!(combinedStableIndex < combinedShadowIndex && combinedShadowIndex < combinedKnowledgeIndex)) {
  fail("combined preview order must continue stable direction -> direction shadow -> knowledge");
}
if (!(combinedKnowledgeIndex < combinedSkillIndex && combinedSkillIndex < combinedTemplateIndex)) {
  fail("combined preview order must continue knowledge -> skills -> templates");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      productionHash: sha256(productionPrompt),
      productionLength: productionPrompt.length,
      legacyHash: sha256(legacyPrompt),
      legacyLength: legacyPrompt.length,
      coreOnlyPreviewHash: sha256(coreOnlyPreviewPrompt),
      coreOnlyPreviewLength: coreOnlyPreviewPrompt.length,
      directionOnlyPreviewHash: sha256(directionOnlyPreviewPrompt),
      directionOnlyPreviewLength: directionOnlyPreviewPrompt.length,
      combinedPreviewHash: sha256(combinedPreviewPrompt),
      combinedPreviewLength: combinedPreviewPrompt.length,
      migrationShadowPromptFiles: shadowFiles,
    },
    null,
    2
  )
);
