# Preview-side project-view projection repaired and verified

Date: 2026-07-08

## What I fixed

I completed the requested follow-up: repair `project-view-service.ts` and get the preview-side project-view projection green.

The earlier attempt to enrich `preview` projection left the object literal malformed. I repaired the `preview` / `export` / `delivery` return structure in `toProjectViewModel(...)` and kept the previously-added export companion fallback logic intact.

## New preview projection surfaced by project view

`toProjectViewModel(...)` now exposes a richer `preview` section when a preview bundle exists:

- `latestPreviewArtifactId`
- `latestPreviewUrl`
- `manifestStorageKey`
- `pageCount`
- `pageArtifactIds`
- `items[]`
  - preview bundle row (`role: bundle`)
  - preview page rows (`role: page`)
  - page rows carry `pageKey`
  - page rows carry `generationProvenance`

This matches the already-runtime-backed preview artifacts instead of leaving the project-view layer artificially slim.

## Verification

Passed after the repair:

```bash
npx tsx productization/tests/project-view-runtime-contract.test.ts
npx tsx productization/tests/phase-runner-preview.test.ts
npx tsx productization/tests/preview-export-artifact-richness.test.ts
npx tsx productization/tests/slice2-generation-flow.test.ts
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

The direct `node -c ...ts` attempt is not a valid syntax check for this ESM TypeScript file on this Node setup (`ERR_UNKNOWN_FILE_EXTENSION .ts`), so the authoritative verification was the real TS execution path via `tsx`.

## What this proves

The higher-level project-view projection now better matches both sides of the runtime-backed downstream contract:

- export companions are surfaced even when only sibling artifacts prove them
- preview bundle/page structure is surfaced with page ids and generation provenance

So the seam has now been pushed upward from bridges → fixture-backed tests → project-view projection.
