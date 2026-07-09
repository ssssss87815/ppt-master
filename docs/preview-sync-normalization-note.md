# Preview sync now performs runtime generation normalization and returns the normalization artifact

Date: 2026-07-08

## What this slice proves

The legacy-manifest repair path is no longer only a standalone proof script. Preview sync itself now performs a minimal repo-native normalization pass by rerunning the existing generation bridge before materializing preview artifacts, and it returns that normalization artifact in the phase result.

## What changed

Updated:

- `productization/backend/orchestrator/phase-runner.ts`
- `productization/tests/slice2-generation-flow.test.ts`
- `productization/tests/preview-normalization-proof.py`

### Orchestrator change

`syncPreviewArtifacts(...)` now does this in order:

1. rerun `runGenerationFromWorkspace(...)`
2. fail fast if that normalization pass fails
3. run `runPreviewFromWorkspace(...)`
4. return both:
   - the normalization generation-manifest artifact
   - the preview bundle/page artifacts

This means preview sync now actively normalizes stale/legacy generation-manifest structure before emitting preview-facing artifacts.

### Test tightening

The slice-2 flow test now requires that preview sync returns a generation-evidence artifact with:

- `metadata.verification = runtime_workspace_generation_bridge`
- `metadata.role = generation_evidence`

That assertion failed at first because preview sync normalized the manifest but discarded the normalization artifact from its returned artifact list. I fixed that by attaching:

- `...normalizedGeneration.artifacts`
- `...previewed.artifacts`

into the phase result.

### Proof script result

`preview-normalization-proof.py` now shows that, on a copied legacy-shaped workspace:

- preview sync returns a normalization artifact id like `*-generation-manifest`
- the rewritten `preview/generation-manifest.json` has `dict` page entries
- `preview/index.json` carries generation provenance forward

## Verification

Commands run:

```bash
npx tsx productization/tests/slice2-generation-flow.test.ts
python3 productization/tests/preview-normalization-proof.py
python3 productization/tests/repair-legacy-generation-manifest-export-proof.py
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

Observed results:

- slice-2 downstream alignment flow: passed
- preview normalization proof: passed
- legacy generation-manifest repair export proof: passed
- export runtime bridge test: passed
- preview runtime bridge test: passed
- generation runtime bridge test: passed

Observed proof output included:

- `normalized_artifact_ids` now contains `preview-normalization-proof-project-generation-manifest`
- `normalized_generation_pages_type = "dict"`
- preview first page provenance includes a real `sha256`

## Honest boundary

This still does not mean all downstream phases now auto-normalize independently.

What is now true is narrower and real:

- preview sync itself performs repo-native generation normalization,
- preview sync exposes that normalization artifact in its result,
- and this reduces the gap between standalone repair proof and normal orchestrator runtime behavior.
