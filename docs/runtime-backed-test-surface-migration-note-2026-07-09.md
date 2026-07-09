# Runtime-backed test-surface migration note

Date: 2026-07-09

## What was migrated in this slice

The following higher-level productization tests were moved away from stale demo/stub assumptions and aligned to the current runtime-backed PPTMASTER/productization flow:

- `productization/tests/project-workbench-shell-confirmation-submission-integration.test.ts`
- `productization/tests/project-shell-confirmation-submission-render.test.ts`
- `productization/tests/project-workbench-confirmation-submission-ui.test.ts`
- `productization/tests/project-workbench-ui-slice.test.ts`
- `productization/tests/project-view-runtime-contract.test.ts`
- `productization/tests/phase-runner-preview.test.ts`
- `productization/tests/preview-export-artifact-richness.test.ts`
- `productization/tests/slice3-delivery-view-model.test.ts`

## Why this migration was necessary

Older tests were asserting against historical surfaces that no longer matched the real productization pipeline. Typical drift patterns included:

- fixed repo-local demo workspace assumptions such as `projects/<id>/spec_lock.md`
- imports of old orchestration helpers no longer exported by `phase-runner.ts`
- stale status names such as `source_profiled` and `confirmations_generated`
- UI expectations tied to older section/action/banner wording rather than the current view-model surface
- tests depending on helpers that no longer exist, such as `buildConfirmationSubmissionViewModel`

The current runtime-backed flow is centered on:

- source intake
- confirmation preparation
- locked confirmations / strategist handoff
- runtime generation normalization
- preview sync from workspace SVG outputs
- export from runtime-backed workspace artifacts
- project/workbench/delivery projection on top of those artifacts

## Current testing pattern

Where downstream phases depend on real strategist/generation/export artifacts, tests should prefer a runtime-backed fixture workspace copied from:

- `/tmp/ppt-downstream-svg-probe`

Recommended pattern:

1. copy the fixture into a `mkdtempSync(...)` temp directory
2. point the `ProjectRecord.workspace.workspacePath` at that temp workspace
3. run real productization actions/phases (`syncPreviewArtifacts`, `exportLocalPhase`, `runStartGeneration`, `runResumeGeneration`, etc.)
4. assert on current surfaced contracts rather than historical naming assumptions

## Contract truths reinforced by this migration

- confirmation submission is surfaced via `toProjectViewModel(...).workbench.confirmationSubmission`
- confirmation section CTA aligns to `submit_confirmations`
- ready/submitted banner text is asserted against current semantics, not old prose fragments
- `export_ready` is treated as a terminal delivery state with no additional suggested workflow action
- delivery/preview/export high-level projections should be backed by runtime artifacts, not synthetic demo placeholders

## What this note does NOT claim

This migration does **not** prove that every legacy/stale test surface in the repo has been modernized.
It also does **not** claim that the productization stack is fully complete end-to-end beyond the slices actually exercised.

What it does prove is narrower and honest:

- several previously stale high-level workbench/project-view/delivery tests now execute against the current runtime-backed path and pass
- the repo is converging on one truthful test style instead of preserving multiple contradictory realities
