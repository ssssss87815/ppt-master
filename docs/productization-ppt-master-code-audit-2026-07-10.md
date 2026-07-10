# PPT Master Productization Code Audit — 2026-07-10

## Scope and standard

This audit covers the current workspace change surface at audit time:

- 12 tracked modified files (`git diff --name-only`), including workflow view models, `project-view-service.ts`, package scripts, and existing regression tests.
- 20 untracked files, including the page / route / shell workbench surface and its tests.
- The governing workflow documents:
  1. `skills/ppt-master/SKILL.md`
  2. `productization/README.md`
  3. `docs/productization-current-status.md`
  4. `docs/productization-ppt-master-workflow-compliance-audit.md`

The standard is: no invented second workflow; Eight Confirmations must remain a user gate; strategist output must be runtime-verified before `spec_ready`; generation must consume the spec lock; preview/export must derive from workspace SVG artifacts; UI must not claim execution that has not occurred.

## Findings

### Aligned and evidenced

1. **Workflow order remains aligned.** The implementation keeps the productization chain as source intake → Eight Confirmations → locked `confirmations/result.json` → strategist materialization → `design_spec.md` / `spec_lock.md` → generation → preview → export.
2. **The confirmations gate is preserved.** `applySubmitConfirmations` keeps the project at `confirmation_locked` unless strategist runtime materialization returns verified artifacts; it explicitly carries `lockedAt` into the bridge payload.
3. **Strategist materialization reuses the PPT Master script.** `strategist-runtime-bridge.ts` invokes `skills/ppt-master/scripts/materialize_from_confirmations.py`; it does not invent a second strategist API.
4. **Downstream generation / preview / export reuse the documented workspace truth sources.** The inspected adapters call the existing workspace-facing flow rather than fabricating page previews or PPTX content in the UI layer. Preview/export carry generation-manifest provenance.
5. **The new workbench surfaces are read/render/route projections.** `project-workbench-page.ts`, `render-project-workbench-shell.ts`, and `project-workbench-http-route.ts` consume project artifacts/checkpoints/view models. The POST route delegates confirmation submission to `applySubmitConfirmations`; it does not falsely mark strategist/generation/export complete.
6. **No diff whitespace errors were found.** `git diff --check` exited 0.

### Non-compliant or unverified items

1. **BLOCKER — runtime-backed tests are not reproducible from the repository.** `/tmp/ppt-downstream-svg-probe` is absent. Eleven tests require it and fail before executing their assertions:
   - `checkpoint-persistence-contract`
   - `export-runtime-bridge`
   - `phase-runner-preview`
   - `preview-export-artifact-richness`
   - `project-view-runtime-contract`
   - `project-workbench-ui-slice`
   - `resume-generation-revision-continuity`
   - `revision-export-slice`
   - `slice2-generation-flow`
   - `slice3-delivery-view-model`
   - `spec-ready-generation-gating`

   A test depending on a manually retained `/tmp` workspace is not a repeatable repository-level proof. The fixture needs to be built deterministically under `productization/test-fixtures/` or via a checked-in setup script.

2. **BLOCKER — three contract tests are stale against current code.** In the complete test inventory:
   - `project-shell-confirmation-submission-render` expects `8 recommendations are ready for user review.`, while the current projection returns `8 confirmation answers ready for input.`
   - `project-view-strategist-honesty` expects the strategist section to be `warning`, while the current view reports `current`.
   - `slice1-happy-path` expects the old checkpoint stage title `Confirmations Locked`.

   These must be resolved by either restoring the documented contract or deliberately updating the tests with a documented, reviewed behavior change. They cannot be left as red drift.

3. **BLOCKER — full TypeScript verification is red.** `npx tsc -p tsconfig.json --noEmit` exits 2. The current code base therefore does not have a clean repository-wide TypeScript proof.

4. **BLOCKER — rendered confirmation UI is not an executable end-to-end submission path.** `render-project-workbench-shell.ts:778–783` renders editable confirmation fields and a submit button, but the form has no `method` / `action` and the shell contains no browser-side serialization that POSTs JSON answers. The route expects a POST JSON body. The direct route unit test proves the handler, not that the rendered browser form can submit confirmations.

5. **BLOCKER — confirmation POST is only an in-memory rerender, not a persisted workflow transition.** `project-workbench-http-route.ts:173–217` applies the pure action, then constructs temporary dependencies for one response. The dependency types expose reads only; no project/artifact/checkpoint write happens. A subsequent GET would reload the original repository state. It must not be represented as a completed, durable `confirmation_locked → strategist` operation until persistence exists and a POST-then-fresh-GET test proves it.

6. **BLOCKER — strategist gate is too permissive for failed/stale artifacts.** In `project-view-service.ts:137–168`, artifacts are only treated as unverified for `pending` / `unverified_runtime_bridge`; failure-like or superseded states can otherwise be projected as verified. The next-action logic can consequently expose `start_generation`. The gate must require explicit successful runtime verification and accepted current artifacts; failed, pending, planned, or superseded inputs must hard-block entry.

7. **HIGH — confirmation completeness is not used for the submitted state.** In `project-view-service.ts:196–214`, completeness is calculated, but the existence of a confirmation result artifact determines `submitted`. Incomplete answers must not be rendered as locked/submitted.

8. **HIGH — export delivery projection needs status/run gating.** Existing export presence can result in delivery/download projection without proving that the artifact is `ready`, tied to the current successful run, and not stale/failed. Add negative tests for failed, stale, and cross-run exports before offering a download.

9. **HIGH — write route security/error behavior is not production-safe.** The route has no identity/ACL/CSRF model and reflects generic exception messages in 500 responses. If this adapter is exposed beyond a local trusted boundary, authorization, CSRF/origin defense, and sanitized external errors are required.

10. **Risk — legacy stub adapter remains in the codebase.** `productization/backend/adapter/pptmaster-adapter.ts` still exposes `stub*` functions and uses labels such as `unverified`. The current submit path has a real runtime bridge, which is the correct direction, but the stubs should be either isolated as test-only fixtures or removed from production-reachable paths. No claim of end-to-end runtime completion should rely on them.

11. **Risk — sizeable service rewrite needs a focused review.** `project-view-service.ts` accounts for most of the tracked churn (the overall diff is 770 additions / 475 deletions). Its status, labels, and timeline behavior changed while legacy tests still assert older values. This is a contract-review concern, not merely test maintenance.

## Verification evidence

- `git diff --check`: pass (exit 0).
- `npm run productization:mainline`: **fail (exit 1)**. `runtime:generation-bridge` and `runtime:preview-bridge` pass, then `runtime:export-bridge` fails because `/tmp/ppt-downstream-svg-probe` is absent.
- Full direct inventory: **30 passed / 44 total; 14 failed**.
- Independently green workbench surfaces in this environment:
  - `project-workbench-page-slice.test.ts`
  - `project-workbench-http-route.test.ts`
  - `project-workbench-app-shell-render.test.ts`

These green tests establish useful page/route/render coverage, but do not compensate for the 14 failing full-inventory tests.

## Audit verdict

**The implementation direction is substantially aligned with the PPT Master workflow, and the runtime bridge design is honest in the inspected paths. However, the current workspace is not strictly audit-pass / release-ready.**

The required remediation order is:

1. Make the runtime fixture reproducible from the repository; do not depend on `/tmp/ppt-downstream-svg-probe`.
2. Reconcile the three stale UI/view-model contracts with the approved workflow semantics.
3. Resolve the repository TypeScript failure.
4. Re-run the full 44-test inventory and require all tests green before claiming the full productization path is verified.
5. Only then resume autonomous delivery work.
