# Script Agent Core Layer

`agent/script-agent/core/` contains stable, direction-neutral screenplay workflow rules.

## Status

- Loaded by default in modular production assembly with `core-stable` markers.
- Also loadable in legacy comparison mode with `core-shadow` markers through `coreMode: "shadow-preview"`.
- Must stay free of BL, women-oriented market, short-drama, English-locale, or platform-specific defaults.

## Boundary

Core may contain:

- stage sequencing and confirmation discipline;
- structured Markdown delivery rules;
- project context, artifact, gate, and source-of-truth rules;
- adaptation workflow skeletons;
- series-bible generation rules;
- metadata extraction rules;
- continuity checks that apply across story forms.

Core must not contain:

- direction-specific audience, market, relationship, or language defaults;
- short-drama rhythm rules that should live under `shared/short-drama/`;
- English dialogue or Chinglish defaults that should live under `shared/locale/english/`;
- BL relationship, market, or dialogue rules that should live under `directions/bl-short-drama/`.

## Maintenance

When adding a new rule:

1. Put it here only if it applies to general screenplay work across forms and markets.
2. Put reusable but optional rules under `shared/`.
3. Put direction commitments under `directions/*`.
4. Leave `legacy/` unchanged unless you are fixing a replay-only archive integrity issue.
