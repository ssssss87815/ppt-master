# Export phase now performs runtime generation normalization and returns the normalization artifact

Date: 2026-07-08

## What this slice proves

Export phase no longer depends on the workspace already having a sufficiently fresh or sufficiently rich `preview/generation-manifest.json`.

Like preview sync, export phase now performs a minimal repo-native normalization pass by rerunning the existing generation bridge before export, and it returns that normalization artifact in the phase result.

## What changed

Updated:

- `productization/backend/orchestrator/phase-runner.ts`
- `productization/tests/slice2-generation-flow.test.ts`
- `productization/tests/export-normalization-proof.py`

### Orchestrator change

`exportLocalPhase(...)` now does this in order:

1. rerun `runGenerationFromWorkspace(...)`
2. fail fast if normalization fails
3. run `runExportFromWorkspace(...)`
4. return both:
   - the normalization generation-manifest artifact
   - the export artifacts (`pptx`, markdown companion, image manifest)

### Slice-2 tightening

The slice-2 runtime-backed flow now requires that export phase returns a normalization artifact with:

- `metadata.verification = runtime_workspace_generation_bridge`
- `metadata.role = generation_evidence`

So export no longer merely inherits a prior normalization step implicitly; it proves the normalization step exists in its own returned runtime evidence.

### Real proof output

`productization/tests/export-normalization-proof.py` runs `exportLocalPhase(...)` on a copied workspace after degrading its `preview/generation-manifest.json` page entries to string-shaped legacy values.

Observed output shows:

- `normalized_artifact_ids` contains `export-normalization-proof-project-generation-manifest`
- rewritten `generation-manifest.json` has `dict` page entries
- export-side `image_manifest.json` carries page-count `10`
- export-side first page now contains:
  - `filename`
  - `storageKey`
  - `sha256`

## Verification

Commands run:

```bash
npx tsx productization/tests/slice2-generation-flow.test.ts
python3 productization/tests/export-normalization-proof.py
python3 productization/tests/preview-normalization-proof.py
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

Observed results:

- slice-2 downstream alignment flow: passed
- export normalization proof: passed
- preview normalization proof: passed
- export runtime bridge test: passed
- preview runtime bridge test: passed
- generation runtime bridge test: passed

## Honest boundary

This still does not mean every possible downstream action now normalizes independently.

What is now true and verified is:

- preview sync normalizes generation manifest state before preview materialization,
- export phase normalizes generation manifest state before export materialization,
- both phases return the normalization artifact as part of the runtime evidence chain.
