# Productization generation runtime bridge note

Date: 2026-07-08

## What changed

This slice replaces the productization generation phase's pure stub transition with a runtime-backed workspace bridge.

New file:

- `productization/backend/adapter/generation-runtime-bridge.ts`

Updated file:

- `productization/backend/orchestrator/phase-runner.ts`

New test:

- `productization/tests/generation-runtime-bridge.test.ts`

Updated test:

- `productization/tests/slice2-generation-flow.test.ts`

## Runtime contract

`runGenerationFromWorkspace(project, now)` does not claim to run the full legacy Executor.

Instead, it performs the smallest honest runtime-backed generation check currently available in-repo:

1. require `design_spec.md`
2. require `spec_lock.md`
3. require non-empty `svg_output/`
4. compare spec mtimes vs SVG mtimes
5. write `preview/generation-manifest.json` as a run artifact recording the workspace evidence

Returned artifact:

- `runtime_log` with metadata:
  - `verification: runtime_workspace_generation_bridge`
  - `role: generation_evidence`
  - `svgCount`
  - evidence mode (`svg_output_not_older_than_specs` or `existing_workspace_svg_inventory`)

## Why this is honest

Before this slice, `runStartGeneration(...)` and `runResumeGeneration(...)` only called:

- `stubStartGeneration(...)`
- `stubResumeGeneration(...)`

with checkpoint notes that explicitly said the generation phase was a stub.

After this slice, generation still does **not** pretend to be the full legacy authoring executor. But it is no longer a pure semantic no-op: it now requires runtime workspace evidence and records that evidence as a concrete manifest artifact.

## What was verified

### Direct bridge test

Command:

```bash
npx tsx productization/tests/generation-runtime-bridge.test.ts
```

Result:

- `generation runtime bridge test: ok`

### Slice-2 flow test

Command:

```bash
npx tsx productization/tests/slice2-generation-flow.test.ts
```

Result:

- `slice-2 generation/export flow test: ok`

The flow test now checks that `start_generation` emits a runtime generation evidence artifact under:

- `preview/generation-manifest.json`

### Regression

Commands:

```bash
npx tsx productization/tests/preview-runtime-bridge.test.ts
npx tsx productization/tests/export-runtime-bridge.test.ts
npx tsx productization/tests/strategist-runtime-bridge-contract.test.ts
npm run runtime:confirmation-files
npm run slice1:strategist-honesty
```

All passed.

## Current boundary

This slice makes `start_generation` / `resume_generation` runtime-backed in an evidence-first sense.

It does **not** yet prove that productization is running the full legacy Executor to freshly author SVG pages from scratch.

The current semantics are:

- strategist outputs are runtime-backed
- generation now requires and records runtime workspace SVG evidence
- preview is runtime-backed from workspace SVGs
- export is runtime-backed from workspace SVGs + notes

## Most accurate current statement

The mainline no longer has a pure stub generation transition. It now has a runtime generation evidence bridge.

The remaining gap, if continuing, is not "make generation non-stub" anymore, but rather:

> replace workspace-evidence generation with a stronger runtime authoring bridge that can be proven to freshly generate or refresh SVG pages from spec inputs.
