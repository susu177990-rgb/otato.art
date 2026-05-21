# Legacy Archive

The original BL script-agent production resources have been archived under `agent/script-agent/legacy/`.

## Replay

| Field | Value |
| --- | --- |
| Legacy direction | `bl-short-drama` |
| Hash | `a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca` |
| Length | `88902` |
| Explicit replay | `loadSystemPrompt("bl-short-drama", { assemblyMode: "legacy" })` |
| Temporary production fallback | `SCRIPT_AGENT_FORCE_LEGACY_BL=1` |

## Migration Map

| Legacy area | New owner |
| --- | --- |
| Stage discipline, Markdown delivery, project context | `core/` |
| Short-drama rhythm, hooks, paywall logic | `shared/short-drama/` |
| English dialogue and locale rules | `shared/locale/english/` plus BL direction addendum |
| Adaptation analysis and planning workflow | `shared/adaptation/` plus direction planning prompts |
| BL identity, market, relationship, dialogue | `directions/bl-short-drama/` |
| General screenplay behavior | `directions/general-screenplay/` |

## Policy

- Default production must not scan or auto-load `legacy/`.
- Legacy may be read only by explicit legacy replay or emergency fallback.
- Any new direction must be implemented through `core/`, `shared/`, and `directions/`.
