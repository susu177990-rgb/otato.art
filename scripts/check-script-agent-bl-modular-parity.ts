import { createHash } from "node:crypto";
import { loadSystemPrompt } from "../lib/prompt-loader";

const DIRECTION_ID = "bl-short-drama";
const LEGACY_HASH = "a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca";
const LEGACY_LENGTH = 88902;
const LEGACY_MARKER = "<!-- file: agent/script-agent/prompts/main_prompt.md -->";
const CORE_STABLE_MARKER = "<!-- core-stable:";
const REQUIRED_TERMS = [
  "女频 BL 短剧",
  "双男主",
  "海外女性向",
  "短剧",
  "付费点",
  "英语对白",
  "中文翻译",
  "Chinglish",
  "STAGE",
];
const REQUIRED_MARKERS = [
  "agent/script-agent/shared/short-drama/pacing-and-hooks.md",
  "agent/script-agent/shared/locale/english/dialogue-locale.md",
  "agent/script-agent/directions/bl-short-drama/prompts/role.md",
  "agent/script-agent/directions/bl-short-drama/prompts/market-and-relationship.md",
  "agent/script-agent/directions/bl-short-drama/prompts/dialogue.md",
  "agent/script-agent/directions/bl-short-drama/prompts/english-locale.md",
  "agent/script-agent/directions/bl-short-drama/templates/stage-brief.md",
];

function fail(message: string): never {
  throw new Error(`script-agent BL modular parity failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const legacyPrompt = loadSystemPrompt(DIRECTION_ID, { assemblyMode: "legacy" });
const modularPrompt = loadSystemPrompt(DIRECTION_ID);

if (sha256(legacyPrompt) !== LEGACY_HASH) fail(`legacy hash changed: ${sha256(legacyPrompt)}`);
if (legacyPrompt.length !== LEGACY_LENGTH) fail(`legacy length changed: ${legacyPrompt.length}`);
if (modularPrompt.includes(LEGACY_MARKER)) fail("BL modular prompt must not include legacy marker");
if (!modularPrompt.includes(CORE_STABLE_MARKER)) fail("BL modular prompt missing core stable marker");

for (const term of REQUIRED_TERMS) {
  if (!modularPrompt.includes(term)) fail(`BL modular prompt missing term: ${term}`);
}
for (const marker of REQUIRED_MARKERS) {
  if (!modularPrompt.includes(marker)) fail(`BL modular prompt missing marker: ${marker}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      legacyHash: sha256(legacyPrompt),
      legacyLength: legacyPrompt.length,
      modularHash: sha256(modularPrompt),
      modularLength: modularPrompt.length,
    },
    null,
    2
  )
);
