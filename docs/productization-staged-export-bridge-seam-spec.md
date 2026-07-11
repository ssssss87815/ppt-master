# Staged Export Bridge Seam Specification

**Status:** Proposed prerequisite for the staged runtime export adapter.
**Scope:** Contract only for `productization/backend/adapter/export-runtime-bridge.ts` and `skills/ppt-master/scripts/productization_export_shim.py`. This does not add a route, UI control, export action, persistence implementation, or lease implementation.

## 1. Purpose and boundary

The existing bridge accepts only a `ProjectRecord`, derives a mutable workspace `exports/` directory, and invokes the shim with one positional path. The shim similarly discovers its own output directory. That is insufficient for the export-persistence foundation: the runtime cannot demonstrate that its input is the locked preview, cannot stage under a caller-controlled deterministic location, and has no cleanup or orphan-audit outcome.

This seam prepares runtime output for the later `ExportPersistenceUnitOfWork`; it does **not** make delivery durable or project state visible. A staged result is never a ready artifact and must not cause `project.status = 'export_ready'`.

```text
validated preview evidence + caller-owned stage destination
  -> bridge validates contract shape and invokes shim
  -> shim writes only inside stage destination
  -> bridge validates staged files and returns staged result
  -> later persistence/reconciliation layer commits or cleans/audits it
```

## 2. Input contract

The future bridge entry point receives a typed request rather than an arbitrary workspace export request:

```ts
type ValidatedPreviewEvidence = {
  projectId: string;
  runId: string;
  previewCheckpointId: string;
  previewArtifactDigest: string;
  previewArtifacts: Array<{
    artifactId: string;
    kind: 'preview_bundle' | 'preview_page_svg';
    storageKey: string;
    sha256: string;
  }>;
};

type ExportStageDestination = {
  exportKey: string;
  attemptNumber: number;
  rootDir: string;
  stageDir: string;
};

type StagedExportRequest = {
  workspacePath: string;
  preview: ValidatedPreviewEvidence;
  destination: ExportStageDestination;
};
```

The caller that has already passed the eligibility gate owns `preview` and `destination`. The bridge must reject a request before invoking the shim when:

- required evidence fields are missing, blank, or internally inconsistent;
- an artifact has a kind outside the two allowed preview kinds;
- a page artifact lacks a digest or storage key;
- `stageDir` is not exactly `rootDir/.staging/<exportKey>/<attemptNumber>` after resolution;
- `stageDir` escapes `rootDir`, or `rootDir`/`stageDir` are not caller-supplied absolute paths;
- an existing stage directory is non-empty, unless an explicit later retry/reconciliation policy authorizes reuse.

`exportKey` remains the deterministic key from the persistence-foundation specification. `attemptNumber` is a positive integer. The bridge must not calculate either from UI input or substitute a project-name directory.

## 3. Deterministic staging destination

The sole runtime output destination is:

```text
<caller rootDir>/.staging/<exportKey>/<attemptNumber>/
```

The later persistence layer selects `rootDir` according to its storage adapter. The initial filesystem adapter may use a project export root, but neither bridge nor shim may infer it from `workspacePath`.

Before invocation, the bridge creates the empty stage directory with restrictive ownership/permissions appropriate to the runtime. The shim receives `--stage-dir <absolute path>` and must write the PPTX, markdown companion, image manifest, and any temporary files only beneath that path. It must not create or select `workspacePath/exports`, select a latest PPTX, overwrite a prior delivery, or delete outside the supplied stage directory.

The shim may read only workspace material referenced by validated evidence plus the existing source assets required by conversion. The later implementation must define the concrete mapping from evidence `storageKey` to workspace files and compare each available SVG/content digest before conversion. A missing, mismatched, stale, or extra required preview input is a terminal integrity result, not a fallback to arbitrary `svg_output/` contents.

## 4. Staged result and validation contract

The shim returns JSON only after all output writes succeed:

```ts
type ShimStagedOutput = {
  status: 'staged';
  stageDir: string;
  pptxPath: string;
  markdownCompanionPath: string;
  imageManifestPath: string;
  sourcePreviewDigest: string;
};

type StagedExportResult = {
  kind: 'staged';
  stageDir: string;
  files: Array<{
    role: 'export_pptx' | 'export_companion' | 'image_manifest';
    path: string;
    bytes: number;
    sha256: string;
    mimeType: string;
  }>;
  sourcePreview: ValidatedPreviewEvidence;
};
```

The bridge independently validates all shim output before returning `kind: 'staged'`:

1. JSON parses and reports the supplied stage directory and source preview digest exactly.
2. Each declared path resolves beneath `stageDir`; no symlink/path traversal may escape it.
3. Exactly one PPTX, one markdown companion, and one JSON image manifest are declared.
4. Every declared file exists, is regular, and is non-empty.
5. The PPTX passes the chosen structural/readability validator. The implementation must name and execute that validator; a file extension alone is not validation.
6. The manifest parses as JSON and carries the locked preview digest and per-preview-artifact evidence needed for reconciliation.
7. The bridge computes returned byte counts and SHA-256 values itself rather than trusting shim-reported values.

A failed validation returns no staged delivery. The bridge classifies conversion/tool/I/O failures as recoverable candidate failures and evidence/digest/path/shape violations as integrity-terminal candidate failures; durable attempt recording is owned by the later persistence layer.

## 5. Cleanup and orphan audit seam

The bridge must return cleanup information for every outcome, without deleting any durable delivery location:

```ts
type StageCleanupOutcome =
  | { kind: 'not_needed' }
  | { kind: 'removed'; stageDir: string }
  | {
      kind: 'orphaned';
      stageDir: string;
      reason: string;
      discoveredAt: string;
      exportKey: string;
      attemptNumber: number;
    };
```

- On shim failure or staged-result validation failure, the bridge attempts recursive removal of the supplied stage directory.
- If removal succeeds, the result includes `removed`.
- If removal cannot be completed, the result includes `orphaned` with a stable reason and provenance. The caller must pass that record to the durable audit/reconciliation adapter before treating the attempt as resolved.
- After a successful staged result, the bridge does not remove stage data. The persistence/promote layer explicitly calls cleanup after a failed commit or records an orphan when cleanup cannot complete.
- Reconciliation enumerates only `.staging/<exportKey>/<attemptNumber>` directories, compares them with durable attempt/audit records, and never promotes an unrecorded directory as a delivery.

The initial adapter may expose an in-memory audit sink for tests, but it must not claim production durability. Concrete persistence/reconciliation owns durable orphan records, retry policy, retention, and final removal.

## 6. Extension boundaries

| Component | May own | Must not own |
| --- | --- | --- |
| Export service / future UoW | eligibility gate, attempt reservation, export key, lease, durable failure/commit facts, promotion policy | converter-specific output discovery |
| Runtime bridge | request-shape validation, stage containment, shim invocation, staged-file validation, cleanup outcome | project status mutation, artifact/checkpoint persistence, route/UI behavior, durable orphan persistence |
| Python shim | conversion using supplied workspace/evidence map, writes inside `--stage-dir`, structured output | choosing delivery/staging roots, reading arbitrary preview files, durable state, cleanup outside its stage directory |
| Persistence/reconciliation adapter | atomic/compensating commit, immutable delivery reference, audit persistence, lease/retry/reconcile | bypassing staged validation or interpreting UI input as evidence |

The existing `runExportFromWorkspace(project, ...)` compatibility seam must be replaced only by a later staged-adapter card with focused contract tests. It must not be widened opportunistically. Until then, it remains non-foundational and must not be used to support a Workbench export action.

## 7. Required contract tests for the staged-adapter card

Before this specification can be considered implemented in runtime code, tests must prove:

1. valid locked evidence plus caller-owned deterministic destination produces a fully validated staged result;
2. missing/mismatched evidence, invalid stage containment, and non-empty stage reuse reject before converter invocation;
3. shim output outside stage, missing/empty companion, malformed manifest, or invalid PPTX rejects and does not return a staged result;
4. failure removes stage data, or returns an auditable orphan record when removal fails;
5. a successful stage does not change project status, create ready persisted artifacts/checkpoints, or expose a route/UI action;
6. shim cannot write to workspace `exports/` when a distinct stage directory is supplied.

## 8. Stop rule

If the repository cannot identify a structural/readability validator or cannot map validated preview evidence to converter inputs without broadening the trust boundary, stop the staged-adapter implementation. Record: `STOP-RULE HIT: Rule / Evidence / Smallest blocker / Resume input`. Do not add a route, UI control, or direct export action as a substitute.
