# Workbench Export PPTX Action Specification

**Status:** Proposed governing specification for the reviewed candidate patch.
**Scope:** `productization/` integration only; this is not a deployed service or a production security/persistence claim.

## 1. Purpose and authoritative workflow

This specification makes the already-projected `export_pptx` next action executable from the Workbench without changing the PPT Master phase order:

```text
locked confirmations
→ verified strategist handoff
→ spec_ready
→ generation
→ workspace-derived current-run preview
→ export PPTX
```

The action is adjacent only to an eligible current-run preview. It does not create a preview, recover a failed generation, start a new run, revise a deck, or expose a general-purpose filesystem/download API.

Authoritative references:

1. `skills/ppt-master/SKILL.md`
2. `productization/README.md`
3. `docs/productization-current-status.md`
4. `docs/zh/productization-current-status.md`
5. `productization/APP_SHELL_NEXT_PAGE_SLICE.md`
6. Existing `exportLocalPhase`, `runExportFromWorkspace`, project view, and Workbench route contracts.

## 2. In scope / not in scope

### In scope

- `POST /projects/:projectId` with JSON `{ "action": "export_pptx" }`.
- A transition from `preview_available` to `export_ready` only after the existing runtime bridge produces PPTX artifacts from the project workspace.
- Persisting the resulting project, runtime-derived artifacts, and an `export_ready` workflow checkpoint through the existing dependency interfaces.
- A truthful Workbench export control only when the existing runtime-backed projection makes `export_pptx` the adjacent next action.
- A fresh GET that reads persisted export state and shows the current-run PPTX delivery projection.

### Explicitly not in scope

- Deployment/hosting, authn/authz, CSRF, rate limiting, tenant isolation, download streaming, or a public artifact URL service.
- A new database transaction engine, migrations, filesystem retention policy, or rollback/recovery subsystem.
- Client-side construction or disclosure of workspace paths.
- Retrying a failed generation/export automatically, revision UX, or any new workflow phase.
- Altering root Kanban control, cron, lane registry, DB triggers, or unrelated dashboard/UI work.

## 3. Request contract

```http
POST /projects/:projectId
Content-Type: application/json

{ "action": "export_pptx" }
```

No additional client input is accepted in this slice. The project identifier comes from the path; `format` is implicitly PPTX. The server owns the workspace binding and invokes the existing local export phase.

Responses:

| Situation | Response | Side effects |
|---|---:|---|
| malformed/non-object request body | `400` | none |
| unknown action | `400` | none |
| project absent | `404` | none |
| project/data read failure | `500` HTML availability failure | none |
| export preconditions are not true | `400` | none |
| runtime export bridge fails | `500` | none |
| persistence capability absent or a persistence write fails | `500` HTML availability failure | see §6; no success claim |
| valid export and persistence succeeds | `200` HTML | project/artifacts/checkpoint persisted |

## 4. Preconditions and rejection matrix

The request is allowed only when the **same server-side projection rule** that advertises `export_pptx` returns it as a next action. That rule must require all of the following:

1. `project.status === "preview_available"`.
2. A completed, current-run preview checkpoint (`preview_synced`) for `project.lastRunId`.
3. Current-run `preview_bundle` and `preview_page_svg` artifacts in `ready` status as required by the existing projection logic.
4. No replacement of that proof by a stale, superseded, failed, pending, planned, or cross-run artifact/checkpoint.

The handler must re-evaluate this server side; an HTML button is never authority for the transition.

| Evidence/state | HTTP result | Writes |
|---|---:|---|
| project not `preview_available` | `400` invalid transition | 0 |
| checkpoint missing, not completed, wrong stage, or wrong run | `400` | 0 |
| preview artifact `failed`, `pending`, `planned`, or `superseded` | `400` | 0 |
| preview proof belongs to a prior/different run | `400` | 0 |
| stale preview evidence no longer matches the project run | `400` | 0 |
| eligible evidence | call runtime bridge | only after runtime success |

A `400` rejection is a truthful block, not an export failure and not a state transition.

## 5. Runtime and state-transition contract

The handler calls the existing `exportLocalPhase(project)` only after the precondition gate succeeds.

`exportLocalPhase` is the authority for runtime work:

1. It reconfirms `preview_available`.
2. It normalizes generation evidence from the bound workspace.
3. It calls `runExportFromWorkspace`.
4. It receives runtime-created `export_pptx`, markdown companion, and image-manifest artifacts.
5. Only on bridge success does it construct:
   - `project.status = "export_ready"`;
   - one completed `export_ready` checkpoint whose artifact IDs name the export artifacts.

The runtime adapter/phase runner retains workspace ownership. The Workbench route and view model must not compute workspace paths, invoke shell commands, or synthesize artifact URLs.

If normalization or the export bridge fails, the handler returns `500` and does **not** persist `export_ready`, export artifacts, or an export-success checkpoint. The response must not claim that a deliverable exists.

## 6. Persistence and consistency contract

After a successful runtime result, the current dependency boundary writes in this order:

1. update the `ProjectRecord` to `export_ready`;
2. create runtime-derived artifacts;
3. create the completed `export_ready` checkpoint.

A successful `200` means all three writes returned successfully. A write failure returns a `500` availability failure and must not render a success page.

**Known slice limitation:** the current store interfaces do not provide a transaction or compensating rollback. Therefore this integration cannot claim atomic persistence under mid-sequence storage failures. The implementation must document this as a bounded, non-production limitation and keep a failed write from being presented as success. A future persistence-engine increment, if needed, is separate work and must not be invented here.

## 7. Idempotency and retry

This slice does **not** silently re-export an already exported current run.

- After success, the project is `export_ready`; the normal precondition gate no longer exposes `export_pptx`.
- A duplicate/retry POST after success receives `400` with zero additional writes.
- A retry after runtime failure is not defined by this slice because no failure checkpoint/retry protocol exists yet; it remains blocked for an explicit future recovery design.
- Concurrent requests are not made safe by a storage-level idempotency key in this in-memory contract. No production concurrency guarantee is claimed.

## 8. Projection and Workbench UI contract

- The next-action projection remains read-only truth derived from server-side project/artifact/checkpoint data.
- The Workbench may render an `export_pptx` button only when the same eligible projection includes it.
- The control posts only `{ action: "export_pptx" }` to the current project route; it sends no workspace path or artifact storage key.
- Rejected POSTs keep the existing project and show no false completion.
- On a `200`, the response and a **fresh subsequent GET** must show `export_ready` and the current-run PPTX delivery artifact through the normal project view.
- Pending/failed/stale/superseded/cross-run cases must remain explanatory/read-only; no export control is rendered.

## 9. Negative-first test plan

1. **`productization/tests/project-workbench-export-pptx-action.test.ts`**
   - Start from an eligible `preview_available` project with real fixture workspace, current-run preview artifacts, and completed preview checkpoint.
   - Remove/replace current-run checkpoint proof: POST returns `400`; project/artifact/checkpoint collections remain unchanged.
   - Restore proof: POST returns `200`; project becomes `export_ready`; a ready PPTX artifact and completed export checkpoint are persisted.
   - Fresh GET renders the delivery projection.

2. **`productization/tests/project-workbench-http-route.test.ts`**
   - Current-run, complete preview can dispatch export.
   - Ineligible state/proof rejects with `400` and zero writes.
   - A second POST after success rejects with zero extra writes.

3. **`productization/tests/workbench-runtime-availability-gate.test.ts`**
   - Preserve failed/pending/planned/superseded/cross-run/stale negative gating.

4. **`productization/tests/project-workbench-next-action-ui.test.ts`**
   - Export control is emitted only for a runtime-eligible projected export action.
   - It carries only action/project identifiers, never a workspace path.

5. **Runtime failure test (add to export action test)**
   - Point the bridge at an invalid/missing workspace fixture or injectable failing bridge.
   - POST returns `500`; status remains `preview_available`; no export artifact/checkpoint is written.

6. **Persistence-failure test (add to export action test)**
   - Make each persistence capability fail in turn.
   - Verify `500` and no success rendering; document that atomic rollback is outside this store contract.

## 10. Implementation decomposition

1. **Export POST handler and server proof gate**
   - Files: `project-workbench-http-route.ts`, focused HTTP/export-action tests.
   - Acceptance: all negative gate cases yield `400` and zero writes; eligible request calls `exportLocalPhase` only once.

2. **Truthful executable control**
   - Files: `render-project-workbench-shell.ts`, next-action UI tests.
   - Acceptance: export control appears only for server-projected eligibility and posts no workspace path.

3. **Failure and duplicate hardening**
   - Files: export-action/HTTP tests; only production code required by a proven defect.
   - Acceptance: runtime failure and duplicate POST cannot fabricate export success or duplicate artifacts.

## 11. Stop rule

Stop implementation and return a review-required handoff if any requested behavior needs a new persistence transaction system, a retry/recovery protocol, a storage/download API, workspace-path construction in the UI, an unverified phase transition, or a change outside the export action boundary. Those are separate product decisions, not implicit extensions of Export PPTX.
