# DESIGN.md usage in productization

This repo now carries a root-level `DESIGN.md` as the design-system source of truth for productization/workbench surfaces.

## Files

- `../DESIGN.md` — authoring source of truth
- `../tailwind.theme.json` — Tailwind JSON export
- `../tokens.json` — DTCG token export
- `../design-md.sh` — local wrapper for lint/export/spec

## Commands

From repo root:

```bash
./design-md.sh lint
./design-md.sh export-tailwind
./design-md.sh export-dtcg
./design-md.sh spec
```

## Productization contract

This directory is currently viewmodel/orchestration-first and does not yet ship a concrete UI runtime. Until a real front-end shell exists, DESIGN.md should be treated as the canonical visual contract for:

- workbench status/timeline surfaces
- confirmation panels
- preview/export cards
- checkpoint/status affordances

## Suggested token mapping

- `colors.primary` — high-emphasis labels, page titles, core metrics
- `colors.secondary` — metadata, helper text, lower-emphasis state labels
- `colors.accent` — primary CTA / active step
- `colors.neutral` — muted panels / background blocks
- `colors.surface` — cards / sheets / inspectors
- `colors.success` — completion / healthy status badges

- `components.button-primary` — submit / start / export CTA
- `components.card-default` — primary content container
- `components.panel-muted` — side panels / background sections
- `components.badge-success` — completed checkpoint/status chip

## Notes

- The current repo has TypeScript productization contracts but no package.json-backed UI app at this layer yet, so integration is file-based for now rather than package-script based.
- When the workbench UI lands, prefer consuming `tailwind.theme.json` or `tokens.json` rather than duplicating palette/spacing values by hand.
