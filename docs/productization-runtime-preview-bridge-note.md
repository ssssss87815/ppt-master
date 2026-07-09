# Productization runtime preview bridge note

Date: 2026-07-08 UTC
Repo: `/home/ubuntu/projects/ppt-master-upstream`

## Goal of this slice
Replace the stub-only meaning of `syncPreviewArtifacts(...)` with a runtime-backed workspace bridge, or prove that the repo lacks such an entrypoint.

## What I found
I did not find a dedicated legacy `preview` CLI that writes `preview/index.json` or `preview/page-1.svg` directly. The productization preview model was a product-side stub abstraction layered on top of the real workspace.

However, the repo does contain a real runtime source of preview truth:
- `<project>/svg_output/*.svg`

Those SVG files are exactly the assets the user would preview before export, and they are already consumed downstream by:
- `svg_to_pptx.py`

So the minimal truthful runtime-backed preview bridge is not a separate legacy generator; it is a bridge that maps existing workspace `svg_output/*.svg` into productization preview artifacts.

## New bridge added
- `productization/backend/adapter/preview-runtime-bridge.ts`

### What it does
Given a project workspace, it:
- reads `<workspace>/svg_output/*.svg`
- materializes `<workspace>/preview/index.json`
- emits productization artifacts:
  - one `preview_bundle`
  - one `preview_page_svg` per SVG page

### Important honesty note
This bridge does **not** claim to generate new preview SVGs. It truthfully re-exposes existing runtime SVG outputs into the productization preview semantics.

## Phase wiring completed
I updated:
- `productization/backend/orchestrator/phase-runner.ts`

`syncPreviewArtifacts(...)` now:
- calls `runPreviewFromWorkspace(...)`
- throws if runtime preview sync fails
- transitions to `preview_available` only after runtime preview artifacts are created
- emits a checkpoint note stating it used the runtime workspace preview bridge

## Tests added / updated
### New direct bridge test
- `productization/tests/preview-runtime-bridge.test.ts`
- verifies a workspace with two SVG pages yields:
  - `preview/index.json`
  - one `preview_bundle`
  - two `preview_page_svg` artifacts

### Updated slice-2 flow test
- `productization/tests/slice2-generation-flow.test.ts`
- now expects preview artifacts to be runtime-backed from workspace SVGs instead of a pure placeholder page path

## Runtime verification
Executed successfully:
- `npx tsx productization/tests/preview-runtime-bridge.test.ts`
- `npx tsx productization/tests/slice2-generation-flow.test.ts`
- `npx tsx productization/tests/export-runtime-bridge.test.ts`
- `npx tsx productization/tests/strategist-runtime-bridge-contract.test.ts`
- `npm run runtime:confirmation-files`
- `npm run slice1:strategist-honesty`

## Current verified chain
The mainline now has runtime-backed bridges for:
- locked confirmations -> strategist markdown artifacts
- strategist spec -> SVG propagation
- workspace SVGs -> preview artifacts
- workspace SVGs/notes -> exported PPTX artifacts

## Remaining boundary
What is still not yet true:
- `start_generation` itself is still a stub transition rather than a runtime generator
- no real runtime bridge yet exists for the generation step that creates or updates `svg_output/` from strategist outputs inside productization
- so the next honest boundary is the generation step itself, not preview or export anymore
