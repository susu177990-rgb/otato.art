import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadSystemPrompt } from "../lib/prompt-loader";

const DIRECTION_ID = "bl-short-drama";
const EXPECTED_HASH = "a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca";
const EXPECTED_LENGTH = 88902;

const REQUIRED_ARCHIVE_DIRS = [
  "agent/script-agent/legacy/prompts",
  "agent/script-agent/legacy/knowledge",
  "agent/script-agent/legacy/templates",
  "agent/script-agent/legacy/skills",
  "agent/script-agent/legacy/context_assets",
];

const ORDER_MARKERS = [
  "<!-- file: agent/script-agent/prompts/main_prompt.md -->",
  "<!-- direction: bl-short-drama; file: agent/script-agent/directions/bl-short-drama/prompts/profile.md -->",
  "<!-- file: agent/script-agent/knowledge/01_EPISODE_SPECS.md -->",
  "<!-- file: agent/script-agent/skills/00_INDEX.md -->",
  "<!-- template: agent/script-agent/templates/",
];

function fail(message: string): never {
  throw new Error(`script-agent legacy baseline failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

for (const dir of REQUIRED_ARCHIVE_DIRS) {
  if (!fs.existsSync(dir)) fail(`missing archive dir: ${dir}`);
}

const prompt = loadSystemPrompt(DIRECTION_ID, { assemblyMode: "legacy" });
const hash = sha256(prompt);
if (hash !== EXPECTED_HASH) fail(`legacy hash changed: ${hash}`);
if (prompt.length !== EXPECTED_LENGTH) fail(`legacy length changed: ${prompt.length}`);

const indexes = ORDER_MARKERS.map((marker) => {
  const index = prompt.indexOf(marker);
  if (index < 0) fail(`missing marker: ${marker}`);
  return index;
});
for (let i = 1; i < indexes.length; i += 1) {
  if (!(indexes[i - 1] < indexes[i])) fail("legacy marker order changed");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      hash,
      length: prompt.length,
      archiveDirs: REQUIRED_ARCHIVE_DIRS,
    },
    null,
    2
  )
);
