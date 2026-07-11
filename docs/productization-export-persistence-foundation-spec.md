# Export Persistence Foundation Specification

**Status:** Proposed, spec-first prerequisite for any executable Workbench `export_pptx` action.
**Scope:** `productization/` contracts and implementation plan only. This document does **not** claim a deployed database, production filesystem transaction, or production recovery service.

## 1. Decision

Workbench Export PPTX must not be exposed as a POST action or enabled UI control until one durable export persistence foundation exists. That foundation makes a delivery fact atomic, idempotent, and independently readable.

The authoritative workflow remains:

```text
locked confirmations
  -> strategist runtime verification
  -> spec_ready
  -> generation
  -> workspace-derived preview
  -> durable export attempt
  -> export PPTX delivery
```

Export is never an alternate path around confirmation, strategist, spec, generation, or preview gates.

## 2. Current capability gap

Current repository seams are deliberately separate:

- `ProjectRepository.update(project)` updates a project record.
- `ArtifactRepository.createMany(artifacts)` creates artifacts.
- `CheckpointRepository.create(checkpoint)` creates a checkpoint.
- `WorkflowRepository.append(checkpoint)` appends workflow history.

Those methods cannot express one all-or-nothing commit across project state, export artifacts, checkpoint, and export-attempt state. Sequential calls are unsafe: a project can reach `export_ready` while artifact/checkpoint persistence fails. They also provide no attempt key, unique constraint, project/run lease, rollback, or atomic fresh-read guarantee.

Therefore the route/UI must not compose those methods directly for export.

## 3. New durable domain contract

### 3.1 ExportAttempt

Introduce a durable `ExportAttempt` owned by a project and one immutable preview input:

```ts
type ExportAttemptStatus =
  | 'reserved'
  | 'running'
  | 'committing'
  | 'completed'
  | 'failed_recoverable'
  | 'failed_terminal'
  | 'superseded';

type ExportAttempt = {
  id: string;
  projectId: string;
  exportKey: string;
  idempotencyKey: string;
  format: 'pptx';
  runId: string;
  previewCheckpointId: string;
  previewArtifactIds: string[];
  previewArtifactDigest: string;
  status: ExportAttemptStatus;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attemptNumber: number;
  stagedOutputRef?: string;
  committedArtifactIds: string[];
  committedCheckpointId?: string;
  errorClass?: 'runtime_recoverable' | 'persistence_recoverable' | 'integrity_terminal';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};
```

`exportKey` is deterministic over:

```text
projectId + runId + previewCheckpointId + sorted preview artifact IDs/digests + format
```

It represents one precise preview snapshot, not merely one project. The service accepts a client `idempotencyKey` but validates it against the request/project and persists it with the attempt; it is not trusted as a delivery identity.

### 3.2 Required state transitions

```text
(no attempt)
  -> reserved
  -> running
  -> committing
  -> completed

running|committing
  -> failed_recoverable | failed_terminal

completed on an old preview snapshot
  -> superseded
```

Rules:

- One `exportKey` may have at most one active (`reserved`, `running`, `committing`) attempt.
- A `completed` attempt for the same key is reused; it does not rerun export or create another checkpoint.
- A same-key `failed_recoverable` attempt may be retried only through an explicit controlled retry transition that increments `attemptNumber` while retaining provenance.
- A `failed_terminal` attempt cannot retry automatically.
- A newer preview/run creates a new key; the old completed delivery remains historical and is marked superseded when that is appropriate for the product projection.

## 4. Eligibility gate before reservation

The export service receives a complete repository snapshot and must reject before reserving/writing unless all are true:

1. Project is `preview_available` with `lastRunId`.
2. Confirmations remain locked and strategist/spec lineage is valid for that run.
3. The current run has ready `preview_bundle` and ready `preview_page_svg` artifacts.
4. A completed `preview_synced` checkpoint covers every required current-run preview artifact.
5. None of those artifacts/checkpoints is planned, pending, failed, superseded, stale, or from another run.
6. The input preview digest still matches the snapshot used to calculate `exportKey`.

The projector may show an **informational** export opportunity only when this gate is true. It must not render an executable control until the transaction/attempt implementation in this specification is delivered.

## 5. Atomic persistence boundary

Introduce a repository-owned unit of work rather than sequential route writes:

```ts
interface ExportPersistenceUnitOfWork {
  reserve(input: ExportReservationInput): Promise<
    | { kind: 'reserved'; attempt: ExportAttempt }
    | { kind: 'completed'; attempt: ExportAttempt; delivery: ExportDelivery }
    | { kind: 'active'; attempt: ExportAttempt }
    | { kind: 'rejected'; reason: ExportRejection }
  >;

  commit(input: ExportCommitInput): Promise<ExportDelivery>;
  fail(input: ExportFailureInput): Promise<ExportAttempt>;
}
```

`commit` is the only operation allowed to make export success visible. It atomically commits:

1. project transition `preview_available -> export_ready` bound to the locked preview snapshot;
2. primary ready `export_pptx` artifact and required companion artifacts;
3. a completed `export_ready` checkpoint whose `artifactIds` cover the primary PPTX and companions;
4. `latestCheckpointId`, update time, and completed `ExportAttempt` state.

### Commit invariant

```text
project.status == export_ready
iff
there is a completed current-run ExportAttempt whose delivery contains a ready PPTX
and whose completed export_ready checkpoint covers that PPTX.
```

No partial success is visible. If `commit` rejects/fails, it must roll back every database mutation in its boundary. If the backing implementation cannot offer transactions, it must not advertise this capability; it must introduce durable compensating records and prove convergence before Workbench POST is enabled.

## 6. Runtime output lifecycle

Runtime output is staged before durable success:

```text
validated preview snapshot
  -> exports/.staging/<exportKey>/<attemptNumber>/
  -> validate PPTX + companions + metadata/digests
  -> durable commit
  -> atomic promote to immutable delivery location
  -> mark completed / make fresh GET visible
```

Requirements:

- The export bridge receives validated run/preview provenance, never an arbitrary UI workspace path.
- The staged PPTX must exist, be non-empty, and pass the chosen structural/readability validation before commit.
- If runtime generation fails, no ready artifact or `export_ready` project state is written.
- If durable commit fails, staging is removed or recorded as a durable orphan with a cleanup audit record; it is never projected as a delivery.
- If promote fails after a committed database transaction, the attempt must become a durable recoverable failure and fresh GET must not claim a completed delivery until the storage/object reference is verifiably available. The production implementation must choose and document the ordering mechanism (transactional object store, outbox/promoter, or equivalent) before claiming atomic cross-store behavior.

## 7. Concurrency and idempotency behavior

| Situation | Result | Runtime work | Durable writes |
|---|---|---|---|
| Same `exportKey`, completed | `200` existing delivery | none | none |
| Same `exportKey`, active | `202`/`409` existing operation | none | none |
| Same key, recoverable failure + explicit retry | retry attempt | one controlled retry | attempt state only before commit |
| Same key, terminal failure | `409`/`422` | none | none |
| Different key, same project/run | reject/queue while active lease exists | none while leased | lease/attempt only |
| Preview changes before reservation | `409` stale preview | none | none |
| Preview changes after reservation | active attempt becomes stale and does not commit | cleanup/fail | failure/supersession fact only |

A project/run-scoped lease belongs in the durable persistence layer, not the browser. Lease expiration must be auditable and reclaimable without allowing two live exporters.

## 8. Failure classification and recovery

| Failure | Classification | Project delivery state | Required durable fact | Retry |
|---|---|---|---|---|
| Missing SVG/tool transient I/O/converter failure | recoverable | remain `preview_available` | failed attempt + reason | explicit retry |
| Commit/storage timeout or partial external-store promotion | recoverable until reconciled | never claim `export_ready` without invariant | failed attempt + reconciliation marker | controlled retry/reconcile |
| Preview integrity/hash/spec lineage violation | terminal | no export delivery | terminal attempt + audit reason | manual investigation |
| Duplicate same key | not failure | existing delivery/operation | unchanged | no new run |

A runtime error must never be converted into an `export_ready` project. A failed attempt must not hide the valid preview needed for a later repair/retry.

## 9. HTTP and fresh-GET contract after foundation implementation

Only after the foundation exists may a route accept:

```http
POST /projects/:projectId
content-type: application/json

{ "action": "export_pptx", "idempotencyKey": "..." }
```

Responses are derived from the attempt result, not a temporary rendering overlay:

- `400`: malformed input or gate failure; zero writes.
- `409`: stale input, terminal attempt, or conflicting lease; zero delivery writes.
- `202`: active same-key attempt; returns durable attempt pointer.
- `200`: existing completed delivery or completed synchronous operation.
- `5xx`: recoverable runtime/persistence error with no false delivery claim.

A fresh GET built from a newly instantiated repository/view service must show only committed delivery truth. It must not depend on arrays or state mutated only in the POST handler.

## 10. Negative-first acceptance matrix

Before a positive UI action exists, tests must prove:

1. Every invalid state/lineage, stale/cross-run preview, failed/planned/pending/superseded artifact, and missing checkpoint returns a rejection with zero writes.
2. Artifact commit failure rolls back project/attempt/checkpoint state; checkpoint failure does the same.
3. Runtime failure leaves no `export_ready` project or ready PPTX artifact and records the classified attempt failure.
4. Same-key concurrent calls produce one runtime invocation and one durable delivery.
5. Same-key completed retry returns the original delivery with no additional artifacts/checkpoints.
6. Changed preview produces a new key and prevents old-attempt commit.
7. A new repository instance/fresh GET sees exactly the completed delivery invariant, or no delivery on every failure case.
8. Staging cleanup/orphan audit is verifiable.

## 11. Ordered implementation cards

1. **Contract + in-memory transactional test double** — define `ExportAttempt`, `ExportPersistenceUnitOfWork`, state machine, and negative atomicity/concurrency tests; no route/UI/runtime export invocation.
2. **Staged runtime export adapter** — produce/validate staged output bound to the locked preview snapshot; no public Workbench action.
3. **Concrete persistence transaction/reconciliation adapter** — implement atomic/compensating commit, project/run lease, idempotency, failure recording, and true fresh-repository reads.
4. **Workbench Export action** — only after cards 1–3 pass: route/UI wiring, status projection, retry presentation, and end-to-end POST/fresh-GET proof.

## 12. Stop rule

If the repository cannot supply a transaction/UoW, durable attempt store, and project/run lease without inventing a production persistence engine, stop after this specification and record the exact missing adapter capability. Do not reintroduce a Workbench export POST or executable UI control as a workaround.
