# Runtime-backed fixture conversion for old phase-runner / artifact-richness tests

Date: 2026-07-08

## What this slice changed

To follow Lee's `先2再1`, after identifying that the remaining workflow-alignment gap was really old demo/stub tests using fake workspaces, I converted those tests to use a real runtime-backed fixture workspace copied from `/tmp/ppt-downstream-svg-probe`.

## Files updated

- `productization/tests/phase-runner-preview.test.ts`
- `productization/tests/preview-export-artifact-richness.test.ts`

## What changed

### 1) `phase-runner-preview.test.ts`
The old test used a fake `projects/pptmaster-demo-project` workspace path that did not contain runtime prerequisites like `spec_lock.md`, which caused the real generation bridge to fail with `ENOENT` once the test was pointed at the true orchestrator path.

The test now:
- copies `/tmp/ppt-downstream-svg-probe` into a temp workspace
- sets `project.workspace.workspacePath` to that copied fixture
- runs real `runStartGeneration(...)`
- runs real `syncPreviewArtifacts(...)`
- asserts preview phase now returns:
  - preview bundle artifact
  - preview page artifact
  - normalization generation-evidence artifact
- cleans up the temp fixture after the test

### 2) `preview-export-artifact-richness.test.ts`
The old version mixed demo-project assumptions with stale metadata expectations that no longer matched the runtime-backed bridges.

The test now:
- copies `/tmp/ppt-downstream-svg-probe` into a temp workspace
- runs real `syncPreviewArtifacts(...)`
- runs real `exportLocalPhase(...)`
- asserts honest runtime-backed facts only:
  - preview normalization artifact exists
  - preview bundle exists and exposes real page count
  - preview page artifact points at the first workspace SVG
  - preview page carries generation provenance for the first svg
  - export normalization artifact exists
  - export pptx artifact exists with pptx mime type
  - markdown companion exists as a runtime log artifact ending in `.md`
  - image manifest companion exists as an `image_manifest` artifact
- cleans up the temp fixture after the test

## Real verification run

These commands now pass:

```bash
npx tsx productization/tests/phase-runner-preview.test.ts
npx tsx productization/tests/preview-export-artifact-richness.test.ts
npx tsx productization/tests/slice2-generation-flow.test.ts
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

## What this proves

This advances the `1` direction (runtime/productization semantics) in an honest way:
- old demo/stub test surfaces are no longer pretending to validate runtime-backed orchestration
- those surfaces now exercise a real ppt-master-shaped workspace fixture
- preview/export normalization semantics are explicitly covered in the converted tests

## Honest boundary

This does **not** yet mean every project-view or UI-facing assertion in old tests has been re-authored to the newest runtime metadata contract. For this slice I intentionally kept the rewrite focused on replacing fake workspace assumptions with real runtime-backed fixture execution and validating the normalization-aware artifact surfaces directly.
