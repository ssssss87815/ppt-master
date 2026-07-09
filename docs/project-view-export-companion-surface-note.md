# Project-view service now surfaces export companions from runtime-backed exports

Date: 2026-07-08

## What changed

I patched `productization/backend/services/project-view-service.ts` so the project-view layer no longer depends exclusively on `export_pptx.metadata.companionArtifacts` being pre-populated.

Previously, `toProjectViewModel(...)` only exposed delivery/export companion artifact ids when the primary export artifact explicitly listed them in `metadata.companionArtifacts`.

That was too weak for the current runtime-backed export path, where the export side can honestly emit sibling artifacts (markdown companion, image manifest) that are present in the artifact list for the same run even if the primary export artifact metadata does not redundantly enumerate them.

## New behavior

`toProjectViewModel(...)` now:

1. first uses `latestExportArtifact.metadata.companionArtifacts` when present;
2. otherwise falls back to scanning the artifact list for artifacts from the same `runId` as the latest export artifact, excluding the primary export artifact itself, and keeping runtime-backed companion kinds:
   - `runtime_log`
   - `image_manifest`

This lets the project-view surface honestly expose:
- `export.companionStorageKeys`
- `delivery.companionArtifactIds`
- `delivery.items[]` companion rows

without pretending the metadata contract was richer than it actually was.

## Verification

Passed after the patch:

```bash
npx tsx productization/tests/project-view-runtime-contract.test.ts
npx tsx productization/tests/phase-runner-preview.test.ts
npx tsx productization/tests/preview-export-artifact-richness.test.ts
npx tsx productization/tests/slice2-generation-flow.test.ts
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

## What this proves

The higher-level productization projection now better matches the real runtime-backed export contract:
- lower-level runtime artifacts already existed,
- fixture-backed tests already proved them,
- and now `project-view-service` surfaces the export companions even when the primary artifact metadata is sparse.

## Honest boundary

This patch specifically strengthens **export companion projection** at the project-view layer. It does not claim that every possible preview/export provenance field is now surfaced in the view model; only that the previously identified companion-artifact seam has been closed for the current runtime-backed path.
