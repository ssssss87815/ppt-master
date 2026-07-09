# Project-view runtime contract probe after fixture conversion

Date: 2026-07-08

## What I tried

After converting the old preview/export tests to runtime-backed fixture workspaces, I pushed one level higher and probed the `project-view-service` contract directly with a new runtime-backed fixture test:

- `productization/tests/project-view-runtime-contract.test.ts`

The test copies `/tmp/ppt-downstream-svg-probe`, runs:

- `syncPreviewArtifacts(...)`
- `exportLocalPhase(...)`

then projects the result through:

- `toProjectViewModel(...)`

## What passed

The lower-level runtime-backed fixture tests still pass:

```bash
npx tsx productization/tests/phase-runner-preview.test.ts
npx tsx productization/tests/preview-export-artifact-richness.test.ts
```

And the core runtime regression set still passes:

```bash
npx tsx productization/tests/slice2-generation-flow.test.ts
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

## Real finding from the new project-view probe

The new project-view contract test **does not pass yet**. The concrete failure I hit at the stopping point is:

```text
AssertionError [ERR_ASSERTION]: project view should expose markdown companion storage key
```

Before that, several stronger assumptions also proved false and had to be relaxed or removed during the probe:

- `view.lastRunId` is not exposed the way the old expectation assumed
- preview manifest fields are not surfaced the way the first stronger expectation assumed
- preview page/bundle item projection is slimmer than the stronger runtime-facing expectation assumed

## Honest interpretation

This means the next remaining seam is now clearly identified:

- the **runtime bridges** are producing real preview/export/normalization artifacts,
- the **fixture-backed lower-level tests** now validate that honestly,
- but the **higher-level project-view projection** still does not fully surface the richer runtime companion/provenance contract in the way a stronger productization-facing view test would want.

In other words, the current blocker is no longer fake fixtures. It is now a real productization-surface question:

> how much of the runtime preview/export companion structure should `toProjectViewModel(...)` explicitly surface?

## Files touched in this slice

- `productization/tests/project-view-runtime-contract.test.ts` (new probe)
- `productization/tests/phase-runner-preview.test.ts` (already converted fixture-backed)
- `productization/tests/preview-export-artifact-richness.test.ts` (already converted fixture-backed)

## Why I stopped here

This is now a genuine product-surface seam, not a fixture problem. To continue honestly, the next step is to inspect and patch `project-view-service.ts` itself so the project view either:

1. explicitly surfaces the runtime companion keys/artifacts we now know exist, or
2. we narrow the intended contract and codify that slimmer projection deliberately.

That is the next smallest meaningful slice, but it is a new edit target (`project-view-service.ts`) rather than more test-fixture cleanup.
