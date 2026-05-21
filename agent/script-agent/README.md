# Script Agent Resource Layout

`agent/script-agent/` is the single source of truth for the screenplay agent resources.

## Current Production Model

Production prompt assembly is now:

`core/` + `shared/` + `directions/`

`legacy/` is an archived replay surface for regression comparison and emergency fallback only.

## Layout

- `core/` contains the reusable screenplay workflow layer: stage protocol, Markdown delivery, project context, adaptation skeletons, continuity checks, series-bible generation, and metadata extraction.
- `shared/` contains opt-in modules that are reusable but not universal defaults:
  - `shared/short-drama/` for short-drama pacing, hooks, paywall, and episode-ending rules.
  - `shared/locale/english/` for English dialogue, locale brief, and Chinglish checks.
  - `shared/adaptation/` for adaptation analysis and planning workflow.
- `directions/` contains creative direction packages:
  - `directions/general-screenplay/` is the new-project default and carries no BL, short-drama, market, language, or episode-count defaults.
  - `directions/bl-short-drama/` preserves the existing women-oriented BL short-drama business direction and loads short-drama plus English-locale shared modules.
- `legacy/` contains the archived historical BL production resources: old `prompts/`, `knowledge/`, `templates/`, `skills/`, and `context_assets/`.
- `fixtures/` contains deterministic prompt assembly samples for offline smoke checks.
- `manifest.json` declares the agent package and the new-project default creative direction.

## Loader Contract

- `loadSystemPrompt(directionId)` uses direction-aware modular assembly by default.
- `general-screenplay` loads `core stable -> general direction prompts -> general direction templates`.
- `bl-short-drama` loads `core stable -> shared/short-drama -> shared/locale/english -> BL direction prompts -> BL direction templates`.
- `loadSystemPrompt("bl-short-drama", { assemblyMode: "legacy" })` replays the archived BL baseline.
- `SCRIPT_AGENT_FORCE_LEGACY_BL=1` temporarily forces BL back to the archived legacy baseline.
- `coreMode: "shadow-preview"` and `directionMode: "shadow-preview"` remain migration-preview tools and intentionally use legacy assembly for comparison.

## Reports

- `LEGACY_BASELINE.md` records the frozen BL legacy hash, length, load order, and replay command.
- `LEGACY_ARCHIVE.md` records the archive policy and migration map.
- `PROMPT_MIGRATION_READINESS.md` records legacy, preview, BL modular, and general modular prompt hashes.
- `PROMPT_DUPLICATE_RULE_DIFF.md` records the rule ownership map from legacy to `core/`, `shared/`, and `directions/`.
- `PROMPT_FIXTURE_REPORT.md` records fixture prompt hashes and shared-module coverage.

## Verification

- `npm run smoke:legacy-baseline` verifies the archived BL baseline hash and load order.
- `npm run smoke:prompt-fixtures` verifies offline fixture prompts and rewrites `PROMPT_FIXTURE_REPORT.md`.
- `npm run smoke:prompt-modular` verifies modular BL and general prompt assembly.
- `npm run smoke:bl-modular-parity` verifies BL modular prompt coverage against required BL business rules.
- `npm run smoke:legacy-archive` verifies legacy is archived, not root-loaded, and still replayable.
- `npm run smoke:prompt-parity` verifies legacy/core-shadow preview behavior.
- `npm run smoke:direction-shadow` verifies direction-shadow preview behavior.
- `npm run report:script-agent-migration` rewrites the readiness report.
- `npm run report:script-agent-rule-diff` rewrites the duplicate-rule diff report.

## Maintenance Policy

- Do not add new behavior to `legacy/`.
- Add universal rules to `core/`.
- Add opt-in reusable rules to `shared/`.
- Add market, genre, relationship, audience, language, and format commitments to a specific `directions/*` package.
- Old projects without a valid direction continue to run as `bl-short-drama`; new projects default to `general-screenplay`.
