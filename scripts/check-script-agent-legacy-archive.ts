import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadSystemPrompt } from "../lib/prompt-loader";

const DIRECTION_ID = "bl-short-drama";
const EXPECTED_HASH = "a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca";
const EXPECTED_LENGTH = 88902;
const LEGACY_MARKER = "<!-- file: agent/script-agent/prompts/main_prompt.md -->";

const archivedDirs = ["prompts", "knowledge", "templates", "skills", "context_assets"].map(
  (dir) => `agent/script-agent/legacy/${dir}`
);
const rootLegacyDirs = ["prompts", "knowledge", "templates", "skills", "context_assets"].map(
  (dir) => `agent/script-agent/${dir}`
);

function fail(message: string): never {
  throw new Error(`script-agent legacy archive failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

for (const dir of archivedDirs) {
  if (!fs.existsSync(dir)) fail(`missing archived dir: ${dir}`);
}
for (const dir of rootLegacyDirs) {
  if (fs.existsSync(dir)) fail(`legacy dir must not remain at production root: ${dir}`);
}

const productionPrompt = loadSystemPrompt(DIRECTION_ID);
const legacyPrompt = loadSystemPrompt(DIRECTION_ID, { assemblyMode: "legacy" });
if (productionPrompt.includes(LEGACY_MARKER)) fail("production BL prompt unexpectedly includes legacy marker");
if (sha256(legacyPrompt) !== EXPECTED_HASH) fail(`legacy replay hash changed: ${sha256(legacyPrompt)}`);
if (legacyPrompt.length !== EXPECTED_LENGTH) fail(`legacy replay length changed: ${legacyPrompt.length}`);

process.env.SCRIPT_AGENT_FORCE_LEGACY_BL = "1";
const forcedLegacyPrompt = loadSystemPrompt(DIRECTION_ID);
if (sha256(forcedLegacyPrompt) !== EXPECTED_HASH) {
  fail(`forced legacy fallback hash changed: ${sha256(forcedLegacyPrompt)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      productionHash: sha256(productionPrompt),
      productionLength: productionPrompt.length,
      legacyHash: sha256(legacyPrompt),
      legacyLength: legacyPrompt.length,
      archivedDirs,
    },
    null,
    2
  )
);
