# PPTMASTER Productization Skeleton

This directory is the MVP product shell boundary for PPTMASTER productization work.

## Purpose

Keep product-facing contracts and orchestration code out of the existing agent-native runtime until the MVP boundaries are frozen.

## Top-level split

- `app/viewmodels/` — UI-facing stable shapes; never expose raw repo workspace layout.
- `backend/actions/` — product actions such as `create_project` and `submit_confirmations`.
- `backend/adapter/` — boundary layer that translates product actions into PPTMASTER runtime operations.
- `backend/orchestrator/` — workflow dispatch and checkpoint coordination.
- `backend/state/` — product truth store contracts and repositories.
- `backend/models/` — shared productization contract types.
- `tests/` — minimal verification for productization contracts and wiring.

## Workspace mapping rule

Productization code may know a `workspacePath`, but UI-facing contracts must never construct repo paths on their own. Mapping lives in the backend adapter layer.

## Current scope

Current verified flow covers three MVP slices:

- Slice 1 lock-in: `draft -> sources_ready -> confirmation_pending -> confirmation_locked`
- Slice 2 generation/preview shell: `confirmation_locked -> generation_in_progress -> preview_available`
- Slice 3 revision/export shell:
  - `preview_available -> revision_requested -> generation_in_progress`
  - `preview_available -> export_ready`

## Current runtime shape

- The unified workflow action entrypoint now covers:
  - Slice 1 actions: `create_project`, `import_sources`, `prepare_confirmations`, `submit_confirmations`
  - Slice 2/3 actions: `start_generation`, `resume_generation`, `request_revision`, `export_pptx`
- Generation, preview, revision, and export are still product-facing orchestration stubs; they preserve workflow/checkpoint shape without exposing internal engine details.
- UI-facing contracts may reference artifact metadata and workflow status, but must not construct repo paths on their own.
- `export_pptx` is currently represented as a product artifact contract and storage key, not a real binary build pipeline yet.
- `revision_requested` currently records product-visible intent/note and routes back into `resume_generation`; it does not yet model per-page diff semantics.
