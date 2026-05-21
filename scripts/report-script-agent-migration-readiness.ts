import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadSystemPrompt, type LoadSystemPromptOptions } from "../lib/prompt-loader";

const DIRECTION_ID = "bl-short-drama";
const GENERAL_DIRECTION_ID = "general-screenplay";
const EXPECTED_LEGACY_BL_HASH = "a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca";
const EXPECTED_LEGACY_BL_LENGTH = 88902;
const REPORT_PATH = "agent/script-agent/PROMPT_MIGRATION_READINESS.md";
const RULE_DIFF_REPORT_PATH = "agent/script-agent/PROMPT_DUPLICATE_RULE_DIFF.md";
const CORE_MANIFEST_PATH = "agent/script-agent/core/core-manifest.json";
const DIRECTION_CONFIG_PATH = "agent/script-agent/directions/bl-short-drama/direction.json";

const MARKERS = {
  legacy: "<!-- file: agent/script-agent/prompts/main_prompt.md -->",
  core: "<!-- core-shadow:",
  stableDirection:
    "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/profile.md -->",
  directionShadow: "<!-- direction-shadow:",
  knowledge: "<!-- file: agent/script-agent/knowledge/01_EPISODE_SPECS.md -->",
  skills: "<!-- file: agent/script-agent/skills/00_INDEX.md -->",
  templates: "<!-- template: agent/script-agent/templates/",
  coreStable: "<!-- core-stable:",
  shared: "<!-- shared:",
  directionTemplate: "<!-- direction-template:",
};

interface CoreManifestModule {
  id?: string;
  path?: string;
  category?: string;
  sourceLegacyFiles?: string[];
}

interface CoreManifest {
  modules?: CoreManifestModule[];
}

interface DirectionConfig {
  legacyPromptFiles?: string[];
  sharedPromptFiles?: string[];
  promptFiles?: string[];
  templateFiles?: string[];
  migrationShadowPromptFiles?: string[];
}

interface PromptVariant {
  id: string;
  label: string;
  options: LoadSystemPromptOptions;
  expectedOrder: string;
  prompt: string;
  hash: string;
  length: number;
}

const directionShadowMappings = [
  {
    file: "directions/bl-short-drama/prompts/role.md",
    ruleArea: "BL 身份定位 / 总编剧角色",
    legacySources: ["prompts/main-agent-role.md"],
    nextAction: "已作为 BL modular stable prompt；删 legacy 前需确认 main_prompt 的总控调度未依赖原段落。",
  },
  {
    file: "directions/bl-short-drama/prompts/market-and-relationship.md",
    ruleArea: "海外市场 / 女性向情绪 / 双男主关系 / 人设默认",
    legacySources: ["prompts/main-agent-role.md", "prompts/rule.md", "prompts/flowchart.md"],
    nextAction: "已作为 BL modular stable prompt；需要继续把 short-drama shared 与 BL_DIRECTION 边界拆细。",
  },
  {
    file: "directions/bl-short-drama/prompts/dialogue.md",
    ruleArea: "BL 对白医生 / 去 AI 味 / 关系攻防",
    legacySources: ["prompts/lines-agent-role.md", "prompts/main-agent-role.md"],
    nextAction: "已作为 BL modular stable prompt；暂不删 lines-agent-role。",
  },
  {
    file: "directions/bl-short-drama/prompts/english-locale.md",
    ruleArea: "英语对白 / Locale 简报 / Chinglish 排雷",
    legacySources: ["prompts/english-lines-agent-role.md", "skills/skill-english-dialogue-localization.md"],
    nextAction: "已作为 BL modular stable prompt；等待 shared locale module 设计后再决定是否从 direction 抽出。",
  },
];

function fail(message: string): never {
  throw new Error(`script-agent migration readiness failed: ${message}`);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function markerIndex(prompt: string, marker: string): number | null {
  const index = prompt.indexOf(marker);
  return index >= 0 ? index : null;
}

function requiredIndex(prompt: string, marker: string, label: string): number {
  const index = markerIndex(prompt, marker);
  if (index == null) fail(`missing ${label} marker`);
  return index;
}

function assertBefore(a: number, b: number, message: string): void {
  if (!(a < b)) fail(message);
}

function loadVariant(
  id: string,
  label: string,
  options: LoadSystemPromptOptions,
  expectedOrder: string,
  directionId = DIRECTION_ID
): PromptVariant {
  const prompt = loadSystemPrompt(directionId, options);
  return {
    id,
    label,
    options,
    expectedOrder,
    prompt,
    hash: sha256(prompt),
    length: prompt.length,
  };
}

function validateVariantOrder(variant: PromptVariant): Record<string, number | null> {
  const indexes = {
    legacy: markerIndex(variant.prompt, MARKERS.legacy),
    core: markerIndex(variant.prompt, MARKERS.core),
    stableDirection: markerIndex(variant.prompt, MARKERS.stableDirection),
    directionShadow: markerIndex(variant.prompt, MARKERS.directionShadow),
    knowledge: markerIndex(variant.prompt, MARKERS.knowledge),
    skills: markerIndex(variant.prompt, MARKERS.skills),
    templates: markerIndex(variant.prompt, MARKERS.templates),
  };

  const legacy = requiredIndex(variant.prompt, MARKERS.legacy, `${variant.id} legacy`);
  const stableDirection = requiredIndex(variant.prompt, MARKERS.stableDirection, `${variant.id} stable direction`);
  const knowledge = requiredIndex(variant.prompt, MARKERS.knowledge, `${variant.id} knowledge`);
  const skills = requiredIndex(variant.prompt, MARKERS.skills, `${variant.id} skills`);
  const templates = requiredIndex(variant.prompt, MARKERS.templates, `${variant.id} templates`);

  assertBefore(legacy, stableDirection, `${variant.id}: legacy must load before stable direction`);
  assertBefore(stableDirection, knowledge, `${variant.id}: stable direction must load before knowledge`);
  assertBefore(knowledge, skills, `${variant.id}: knowledge must load before skills`);
  assertBefore(skills, templates, `${variant.id}: skills must load before templates`);

  if (variant.options.coreMode === "shadow-preview") {
    const core = requiredIndex(variant.prompt, MARKERS.core, `${variant.id} core shadow`);
    assertBefore(legacy, core, `${variant.id}: legacy must load before core shadow`);
    assertBefore(core, stableDirection, `${variant.id}: core shadow must load before stable direction`);
  } else if (indexes.core != null) {
    fail(`${variant.id}: core shadow marker present without coreMode shadow-preview`);
  }

  if (variant.options.directionMode === "shadow-preview") {
    const directionShadow = requiredIndex(variant.prompt, MARKERS.directionShadow, `${variant.id} direction shadow`);
    assertBefore(stableDirection, directionShadow, `${variant.id}: stable direction must load before direction shadow`);
    assertBefore(directionShadow, knowledge, `${variant.id}: direction shadow must load before knowledge`);
  } else if (indexes.directionShadow != null) {
    fail(`${variant.id}: direction shadow marker present without directionMode shadow-preview`);
  }

  return indexes;
}

function tableRow(cells: Array<string | number>): string {
  return `| ${cells.map((cell) => String(cell).replace(/\n/g, "<br>")).join(" | ")} |`;
}

function markerValue(index: number | null): string {
  return index == null ? "not loaded" : String(index);
}

function jsonList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.map((v) => `\`${v}\``).join("<br>") : "";
}

const coreManifest = JSON.parse(fs.readFileSync(CORE_MANIFEST_PATH, "utf8")) as CoreManifest;
const directionConfig = JSON.parse(fs.readFileSync(DIRECTION_CONFIG_PATH, "utf8")) as DirectionConfig;
const coreModules = coreManifest.modules ?? [];
const directionShadowFiles = directionConfig.migrationShadowPromptFiles ?? [];

if (coreModules.length === 0) fail("core manifest has no modules");
if (directionShadowFiles.length === 0) fail("direction has no migrationShadowPromptFiles");

const variants = [
  loadVariant(
    "legacy",
    "Legacy BL baseline",
    { assemblyMode: "legacy" },
    "legacy -> stable direction -> knowledge -> skills -> templates"
  ),
  loadVariant(
    "core-only",
    "Core shadow preview",
    { assemblyMode: "legacy", coreMode: "shadow-preview" },
    "legacy -> core shadow -> stable direction -> knowledge -> skills -> templates"
  ),
  loadVariant(
    "direction-only",
    "Direction shadow preview",
    { assemblyMode: "legacy", directionMode: "shadow-preview" },
    "legacy -> stable direction -> direction shadow -> knowledge -> skills -> templates"
  ),
  loadVariant(
    "combined",
    "Combined preview",
    { assemblyMode: "legacy", coreMode: "shadow-preview", directionMode: "shadow-preview" },
    "legacy -> core shadow -> stable direction -> direction shadow -> knowledge -> skills -> templates"
  ),
];

const modularVariants = [
  loadVariant(
    "bl-modular",
    "BL production modular prompt",
    {},
    "core stable -> shared short-drama -> BL direction prompts -> BL direction templates",
    DIRECTION_ID
  ),
  loadVariant(
    "general-modular",
    "General production modular prompt",
    {},
    "core stable -> general direction prompts -> general direction templates",
    GENERAL_DIRECTION_ID
  ),
];

const legacyVariant = variants[0];
if (legacyVariant.hash !== EXPECTED_LEGACY_BL_HASH) {
  fail(`legacy BL hash changed: ${legacyVariant.hash}`);
}
if (legacyVariant.length !== EXPECTED_LEGACY_BL_LENGTH) {
  fail(`legacy BL length changed: ${legacyVariant.length}`);
}

const markerIndexes = new Map<string, Record<string, number | null>>();
for (const variant of variants) {
  markerIndexes.set(variant.id, validateVariantOrder(variant));
}

for (const variant of modularVariants) {
  if (variant.prompt.includes(MARKERS.legacy)) {
    fail(`${variant.id}: modular prompt must not include legacy marker`);
  }
  requiredIndex(variant.prompt, MARKERS.coreStable, `${variant.id} core stable`);
  requiredIndex(variant.prompt, MARKERS.directionTemplate, `${variant.id} direction template`);
}

const report = `# Prompt Migration Readiness

Generated by \`npm run report:script-agent-migration\`. This report is deterministic and intentionally has no timestamp.

## Conclusion

- Default production assembly is modular for stable directions.
- Legacy BL can still be replayed explicitly and through the \`SCRIPT_AGENT_FORCE_LEGACY_BL=1\` fallback.
- Core stable modules are part of modular production; core-shadow and direction-shadow markers remain migration-preview modes.
- The duplicate-rule diff report is the required precondition before deleting legacy prompt rules.

## Legacy BL Baseline

| Field | Value |
| --- | --- |
| Creative direction | \`${DIRECTION_ID}\` |
| Expected legacy hash | \`${EXPECTED_LEGACY_BL_HASH}\` |
| Actual legacy hash | \`${legacyVariant.hash}\` |
| Expected legacy length | \`${EXPECTED_LEGACY_BL_LENGTH}\` |
| Actual legacy length | \`${legacyVariant.length}\` |
| Legacy load order | ${variants[0].expectedOrder} |

## Prompt Variants

| Variant | Options | Hash | Length | Expected order |
| --- | --- | --- | --- | --- |
${variants
  .map((variant) =>
    tableRow([
      variant.label,
      `\`${JSON.stringify(variant.options)}\``,
      `\`${variant.hash}\``,
      variant.length,
      variant.expectedOrder,
    ])
  )
  .join("\n")}

## Modular Prompt Baselines

| Variant | Options | Hash | Length | Expected order |
| --- | --- | --- | --- | --- |
${modularVariants
  .map((variant) =>
    tableRow([
      variant.label,
      `\`${JSON.stringify(variant.options)}\``,
      `\`${variant.hash}\``,
      variant.length,
      variant.expectedOrder,
    ])
  )
  .join("\n")}

## Marker Indexes

| Variant | legacy | core shadow | stable direction | direction shadow | knowledge | skills | templates |
| --- | --- | --- | --- | --- | --- | --- | --- |
${variants
  .map((variant) => {
    const indexes = markerIndexes.get(variant.id)!;
    return tableRow([
      variant.id,
      markerValue(indexes.legacy),
      markerValue(indexes.core),
      markerValue(indexes.stableDirection),
      markerValue(indexes.directionShadow),
      markerValue(indexes.knowledge),
      markerValue(indexes.skills),
      markerValue(indexes.templates),
    ]);
  })
  .join("\n")}

## Core Modules

| Module | Category | Path | Legacy sources |
| --- | --- | --- | --- |
${coreModules
  .map((mod) =>
    tableRow([
      mod.id ?? "",
      mod.category ?? "",
      mod.path ?? "",
      jsonList(mod.sourceLegacyFiles),
    ])
  )
  .join("\n")}

## BL Direction Shadow Mapping

| Shadow file | Rule area | Legacy sources | Next action |
| --- | --- | --- | --- |
${directionShadowMappings
  .map((mapping) =>
    tableRow([
      mapping.file,
      mapping.ruleArea,
      jsonList(mapping.legacySources),
      mapping.nextAction,
    ])
  )
  .join("\n")}

## Duplicate Rule Diff

| Field | Value |
| --- | --- |
| Report | \`${RULE_DIFF_REPORT_PATH}\` |
| Command | \`npm run report:script-agent-rule-diff\` |
| Current first deletion candidate | BL identity and market positioning, after modular fixtures are accepted. |

## Fallback

| Field | Value |
| --- | --- |
| Temporary BL fallback | \`SCRIPT_AGENT_FORCE_LEGACY_BL=1\` |
| Normal BL production | modular prompt \`${modularVariants[0].hash}\` |
| Normal general production | modular prompt \`${modularVariants[1].hash}\` |

## Do Not Delete In This Round

| Area | Reason |
| --- | --- |
| \`agent/script-agent/legacy/prompts/main_prompt.md\` | Archived legacy production contract; replay only through explicit legacy mode. |
| \`agent/script-agent/legacy/templates/*.md\` | Archived parser-facing artifact shapes. |
| \`agent/script-agent/legacy/knowledge/*.md\` | Archived production knowledge; shared modules now own migrated reusable rules. |
| \`agent/script-agent/legacy/skills/short-drama/references/*.md\` | Archived reference-only material. |
| \`agent/script-agent/legacy/context_assets/character_reference.md\` | Archived mixed project-context and BL example material. |

## Stage Summary

| Stage | Result |
| --- | --- |
| 1 | Creative direction registry established; new projects now default to \`general-screenplay\`, while legacy missing/invalid projects fall back to \`bl-short-drama\`. |
| 2 | Boundary inventory and migration categories documented. |
| 3 | \`core/\` layer created as a shadow copy for review. |
| 4 | \`coreMode: "shadow-preview"\` added for explicit core preview. |
| 5 | BL direction shadow files and \`migrationShadowPromptFiles\` metadata added. |
| 6 | \`directionMode: "shadow-preview"\` added for explicit direction shadow preview. |
| 7 | This readiness report captures prompt hashes, load order, duplicate-rule mapping, and deletion boundaries. |
| Completion sweep | \`general-screenplay\` direction, modular assembly, duplicate-rule diff, and lint cleanup added without changing archived legacy BL hash. |
| Perfect migration | Legacy resources archived; default production no longer scans legacy; fallback replay remains hash-locked. |

## Next Round Recommendation

The first deletion-capable phase should target only one narrow area, carry prompt snapshots, and treat any default hash change as an intentional migration artifact requiring explicit review.
`;

fs.writeFileSync(REPORT_PATH, report, "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      reportPath: REPORT_PATH,
      variants: variants.map((variant) => ({
        id: variant.id,
        hash: variant.hash,
        length: variant.length,
      })),
      modularVariants: modularVariants.map((variant) => ({
        id: variant.id,
        hash: variant.hash,
        length: variant.length,
      })),
      coreModules: coreModules.map((mod) => mod.id),
      directionShadowFiles,
    },
    null,
    2
  )
);
