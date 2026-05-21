import fs from "node:fs";
import { createHash } from "node:crypto";
import { loadSystemPrompt } from "../lib/prompt-loader";

const REPORT_PATH = "agent/script-agent/PROMPT_DUPLICATE_RULE_DIFF.md";
const EXPECTED_LEGACY_BL_HASH = "a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca";
const EXPECTED_LEGACY_BL_LENGTH = 88902;

type RuleDiffRow = {
  area: string;
  classification: "CORE" | "SHORT_DRAMA_SHARED" | "BL_DIRECTION" | "ENGLISH_LOCALE" | "PROJECT_CONTEXT" | "DO_NOT_MOVE_YET";
  legacySources: string[];
  targetFiles: string[];
  status: string;
  deletionGate: string;
};

const rows: RuleDiffRow[] = [
  {
    area: "阶段推进、确认纪律、产物格式",
    classification: "CORE",
    legacySources: ["prompts/main_prompt.md", "prompts/flowchart.md", "prompts/deliverable-markdown.md"],
    targetFiles: [
      "core/prompts/stage-protocol.md",
      "core/prompts/deliverable-markdown.md",
      "core/prompts/project-context.md",
    ],
    status: "core shadow 已覆盖主要规则；modular prompt 可用 core-stable marker 验证。",
    deletionGate: "先补 stage fixtures，再从 legacy 中删同义重复段。",
  },
  {
    area: "短剧节奏、强钩子、集尾接戏、付费点",
    classification: "SHORT_DRAMA_SHARED",
    legacySources: ["prompts/rule.md", "prompts/skill.md", "knowledge/02_SHORTFORM_PACING.md"],
    targetFiles: ["shared/short-drama/pacing-and-hooks.md"],
    status: "短剧规则已归位到 shared/short-drama；当前 BL modular 与短剧 fixture 加载。",
    deletionGate: "确认未来短剧方向复用该 shared module 后，再处理 archived legacy 重复。",
  },
  {
    area: "BL 身份定位、海外女性向市场、双男主关系",
    classification: "BL_DIRECTION",
    legacySources: ["prompts/main-agent-role.md", "prompts/rule.md", "prompts/flowchart.md"],
    targetFiles: [
      "directions/bl-short-drama/prompts/role.md",
      "directions/bl-short-drama/prompts/market-and-relationship.md",
    ],
    status: "BL 规则已提升为 modular direction promptFiles；legacy 已归档，仅作回放。",
    deletionGate: "BL modular parity smoke 通过后，可继续精简 archived legacy 对照说明。",
  },
  {
    area: "BL 对白医生、关系攻防、去 AI 味",
    classification: "BL_DIRECTION",
    legacySources: ["prompts/lines-agent-role.md", "prompts/main-agent-role.md"],
    targetFiles: ["directions/bl-short-drama/prompts/dialogue.md"],
    status: "已进入 BL modular direction promptFiles。",
    deletionGate: "保留 archived lines-agent-role 作为回归对照，直到 STAGE 7 fixtures 覆盖对白风格。",
  },
  {
    area: "英语对白、Locale 简报、Chinglish 排雷",
    classification: "ENGLISH_LOCALE",
    legacySources: ["prompts/english-lines-agent-role.md", "skills/skill-english-dialogue-localization.md"],
    targetFiles: ["shared/locale/english/dialogue-locale.md", "directions/bl-short-drama/prompts/english-locale.md"],
    status: "英语本地化已归位到 shared/locale/english，并保留 BL 方向补充。",
    deletionGate: "未来多个英语方向可直接复用 shared locale module。",
  },
  {
    area: "系列圣经、Artifact、Gate、项目上下文",
    classification: "PROJECT_CONTEXT",
    legacySources: ["prompts/generate-series-bible.md", "prompts/generate-settings.md", "context_assets/character_reference.md"],
    targetFiles: ["core/prompts/project-context.md", "core/skills/continuity-pass.md"],
    status: "core 已覆盖原则；legacy context_assets 已归档为回归对照。",
    deletionGate: "后续如需 neutral context asset schema，另起结构阶段。",
  },
  {
    area: "main_prompt 总控、templates、knowledge、skills references",
    classification: "DO_NOT_MOVE_YET",
    legacySources: [
      "prompts/main_prompt.md",
      "templates/*.md",
      "knowledge/*.md",
      "skills/short-drama/references/*.md",
    ],
    targetFiles: ["无直接删除目标"],
    status: "已归档为 legacy 回放材料，不参与默认生产加载。",
    deletionGate: "不得直接维护；只能用于 hash 回放和历史对照。",
  },
];

function fail(message: string): never {
  throw new Error(`script-agent rule diff failed: ${message}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function legacyRelToAbs(relPath: string): string {
  return `agent/script-agent/legacy/${relPath}`;
}

function targetRelToAbs(relPath: string): string {
  return `agent/script-agent/${relPath}`;
}

function legacyFileExists(relPath: string): boolean {
  if (relPath.includes("*") || relPath === "无直接删除目标") return true;
  return fs.existsSync(legacyRelToAbs(relPath));
}

function targetFileExists(relPath: string): boolean {
  if (relPath.includes("*") || relPath === "无直接删除目标") return true;
  return fs.existsSync(targetRelToAbs(relPath));
}

function list(values: string[]): string {
  return values.map((value) => `\`${value}\``).join("<br>");
}

for (const row of rows) {
  for (const source of row.legacySources) {
    if (!legacyFileExists(source)) fail(`missing archived legacy source: ${source}`);
  }
  for (const target of row.targetFiles) {
    if (!targetFileExists(target)) fail(`missing target file: ${target}`);
  }
}

const legacyPrompt = loadSystemPrompt("bl-short-drama", { assemblyMode: "legacy" });
if (sha256(legacyPrompt) !== EXPECTED_LEGACY_BL_HASH) {
  fail(`legacy BL hash changed: ${sha256(legacyPrompt)}`);
}
if (legacyPrompt.length !== EXPECTED_LEGACY_BL_LENGTH) {
  fail(`legacy BL length changed: ${legacyPrompt.length}`);
}

const report = `# Prompt Duplicate Rule Diff

Generated by \`npm run report:script-agent-rule-diff\`. This report is deterministic and intentionally has no timestamp.

## Conclusion

- Archived legacy BL prompt is still replayable and hash-locked.
- Modular production no longer scans legacy by default.
- Archived legacy material is only for fallback and historical comparison.

## Legacy Baseline

| Field | Value |
| --- | --- |
| Direction | \`bl-short-drama\` |
| Hash | \`${sha256(legacyPrompt)}\` |
| Length | \`${legacyPrompt.length}\` |

## Duplicate Rule Map

| Rule area | Classification | Legacy sources | New target | Status | Deletion gate |
| --- | --- | --- | --- | --- | --- |
${rows
  .map((row) =>
    [
      row.area,
      `\`${row.classification}\``,
      list(row.legacySources),
      list(row.targetFiles),
      row.status,
      row.deletionGate,
    ]
      .map((cell) => ` ${cell} `)
      .join("|")
  )
  .map((row) => `|${row}|`)
  .join("\n")}

## Archive Policy

1. Do not edit archived legacy files for new behavior.
2. Add new behavior to \`core/\`, \`shared/\`, or \`directions/\`.
3. Use archived legacy only for fallback replay and regression comparison.
`;

fs.writeFileSync(REPORT_PATH, report, "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      reportPath: REPORT_PATH,
      legacyHash: sha256(legacyPrompt),
      legacyLength: legacyPrompt.length,
      rows: rows.length,
    },
    null,
    2
  )
);
