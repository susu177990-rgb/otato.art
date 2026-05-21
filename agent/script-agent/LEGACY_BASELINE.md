# Legacy Baseline

This document freezes the archived BL legacy prompt as a replayable historical baseline.

## Baseline

| Field | Value |
| --- | --- |
| Direction | `bl-short-drama` |
| Hash | `a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca` |
| Length | `88902` |
| Replay command | `npm run smoke:legacy-baseline` |
| Replay mode | `loadSystemPrompt("bl-short-drama", { assemblyMode: "legacy" })` |

## Archived Resource Surface

- `legacy/prompts/`
- `legacy/knowledge/`
- `legacy/templates/`
- `legacy/skills/`
- `legacy/context_assets/`

## Policy

- Do not edit archived legacy files for new behavior.
- Add or change behavior in `core/`, `shared/`, or `directions/`.
- Legacy exists only for fallback replay, regression comparison, and migration history.
