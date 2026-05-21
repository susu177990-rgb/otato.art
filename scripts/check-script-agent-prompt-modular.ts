import { createHash } from "node:crypto";
import {
  loadAdaptationPlannerPrompt,
  loadPlanningSessionPrompt,
  loadSystemPrompt,
} from "../lib/prompt-loader";

const BL_DIRECTION_ID = "bl-short-drama";
const GENERAL_DIRECTION_ID = "general-screenplay";
const EXPECTED_LEGACY_BL_HASH = "a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca";
const EXPECTED_LEGACY_BL_LENGTH = 88902;

const LEGACY_MARKER = "<!-- file: agent/script-agent/prompts/main_prompt.md -->";
const KNOWLEDGE_MARKER = "<!-- file: agent/script-agent/knowledge/01_EPISODE_SPECS.md -->";
const CORE_STABLE_MARKER = "<!-- core-stable:";
const BL_SHORT_DRAMA_SHARED_MARKER =
  "<!-- shared: bl-short-drama; file: agent/script-agent/shared/short-drama/pacing-and-hooks.md -->";
const BL_ENGLISH_LOCALE_SHARED_MARKER =
  "<!-- shared: bl-short-drama; file: agent/script-agent/shared/locale/english/dialogue-locale.md -->";
const BL_TEMPLATE_MARKER =
  "<!-- direction-template: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/templates/stage-brief.md -->";
const GENERAL_TEMPLATE_MARKER =
  "<!-- direction-template: general-screenplay; file: agent/script-agent/directions/general-screenplay/templates/stage-brief.md -->";

const blDirectionMarkers = [
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/profile.md -->",
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/role.md -->",
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/market-and-relationship.md -->",
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/dialogue.md -->",
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/english-locale.md -->",
];

const blRequiredTerms = ["女频 BL 短剧", "双男主", "海外女性向", "英语对白", "Chinglish"];
const generalForbiddenTerms = ["女频 BL", "双男主", "海外女性向", "Chinglish"];

function fail(message: string): never {
  throw new Error(`script-agent modular prompt failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mustInclude(prompt: string, marker: string, label: string): void {
  if (!prompt.includes(marker)) fail(`missing ${label}: ${marker}`);
}

function mustNotInclude(prompt: string, marker: string, label: string): void {
  if (prompt.includes(marker)) fail(`unexpected ${label}: ${marker}`);
}

const legacyBlPrompt = loadSystemPrompt(BL_DIRECTION_ID, { assemblyMode: "legacy" });
const blModularPrompt = loadSystemPrompt(BL_DIRECTION_ID);
const generalModularPrompt = loadSystemPrompt(GENERAL_DIRECTION_ID);
const generalPlanningPrompt = loadPlanningSessionPrompt(GENERAL_DIRECTION_ID);
const generalAdaptationPlannerPrompt = loadAdaptationPlannerPrompt(GENERAL_DIRECTION_ID);

if (sha256(legacyBlPrompt) !== EXPECTED_LEGACY_BL_HASH) {
  fail(`legacy BL hash changed: ${sha256(legacyBlPrompt)}`);
}
if (legacyBlPrompt.length !== EXPECTED_LEGACY_BL_LENGTH) {
  fail(`legacy BL length changed: ${legacyBlPrompt.length}`);
}

for (const [label, prompt] of [
  ["BL modular", blModularPrompt],
  ["general modular", generalModularPrompt],
] as const) {
  mustNotInclude(prompt, LEGACY_MARKER, `${label} legacy marker`);
  mustNotInclude(prompt, KNOWLEDGE_MARKER, `${label} global knowledge marker`);
  mustInclude(prompt, CORE_STABLE_MARKER, `${label} core stable marker`);
}

mustInclude(blModularPrompt, BL_SHORT_DRAMA_SHARED_MARKER, "BL shared short-drama marker");
mustInclude(blModularPrompt, BL_ENGLISH_LOCALE_SHARED_MARKER, "BL shared English locale marker");
mustInclude(blModularPrompt, BL_TEMPLATE_MARKER, "BL direction template marker");
for (const marker of blDirectionMarkers) {
  mustInclude(blModularPrompt, marker, "BL direction prompt marker");
}
for (const term of blRequiredTerms) {
  mustInclude(blModularPrompt, term, `BL required term ${term}`);
}

mustInclude(
  generalModularPrompt,
  "<!-- direction: general-screenplay; file: agent/script-agent/directions/general-screenplay/prompts/profile.md -->",
  "general direction marker"
);
mustInclude(generalModularPrompt, GENERAL_TEMPLATE_MARKER, "general direction template marker");
for (const term of generalForbiddenTerms) {
  mustNotInclude(generalModularPrompt, term, `general forbidden term ${term}`);
  mustNotInclude(generalPlanningPrompt, term, `general planning forbidden term ${term}`);
  mustNotInclude(generalAdaptationPlannerPrompt, term, `general adaptation planner forbidden term ${term}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      legacyBlHash: sha256(legacyBlPrompt),
      legacyBlLength: legacyBlPrompt.length,
      blModularHash: sha256(blModularPrompt),
      blModularLength: blModularPrompt.length,
      generalModularHash: sha256(generalModularPrompt),
      generalModularLength: generalModularPrompt.length,
    },
    null,
    2
  )
);
