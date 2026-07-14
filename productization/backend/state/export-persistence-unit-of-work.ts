import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts.ts';
import type { ExportAttempt, ExportDelivery, ExportRejection } from '../models/export-attempt.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects.ts';

export type ExportReservationInput = {
  attemptId: string;
  projectId: string;
  exportKey: string;
  idempotencyKey: string;
  format: 'pptx';
  runId: string;
  previewCheckpointId: string;
  previewArtifactIds: string[];
  previewArtifactDigest: string;
  leaseOwner: string;
  leaseExpiresAt: string;
  now: string;
};

export type ExportCommitInput = {
  attemptId: string;
  leaseOwner: string;
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  checkpoint: WorkflowCheckpoint;
  now: string;
};

export type ExportFailureInput = {
  attemptId: string;
  errorClass: NonNullable<ExportAttempt['errorClass']>;
  errorMessage: string;
  now: string;
};

export interface ExportPersistenceUnitOfWork {
  reserve(input: ExportReservationInput): Promise<
    | { kind: 'reserved'; attempt: ExportAttempt }
    | { kind: 'completed'; attempt: ExportAttempt; delivery: ExportDelivery }
    | { kind: 'active'; attempt: ExportAttempt }
    | { kind: 'rejected'; reason: ExportRejection }
  >;
  commit(input: ExportCommitInput): Promise<ExportDelivery>;
  fail(input: ExportFailureInput): Promise<ExportAttempt>;
}

export type ExportPersistenceSnapshot = {
  projects: ProjectRecord[];
  artifacts: ProductArtifactRef[];
  checkpoints: WorkflowCheckpoint[];
  attempts: ExportAttempt[];
};

export type ExportPersistenceStateRepository = {
  snapshot(): ExportPersistenceSnapshot;
  transaction<T>(operation: (draft: ExportPersistenceSnapshot) => T): T;
};

type FailurePoint = 'project' | 'artifacts' | 'checkpoint' | 'attempt';
export type ExportPersistenceSeed = Pick<ExportPersistenceSnapshot, 'projects'> & Partial<Omit<ExportPersistenceSnapshot, 'projects'>>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isActive(status: ExportAttempt['status']): boolean {
  return status === 'reserved' || status === 'running' || status === 'committing';
}

function deliveryFrom(attempt: ExportAttempt): ExportDelivery {
  const primaryArtifactId = attempt.committedArtifactIds[0];
  if (!primaryArtifactId || !attempt.committedCheckpointId) {
    throw new Error('completed attempt has no durable delivery');
  }
  return {
    attemptId: attempt.id,
    projectId: attempt.projectId,
    exportKey: attempt.exportKey,
    artifactIds: [...attempt.committedArtifactIds],
    primaryArtifactId,
    checkpointId: attempt.committedCheckpointId,
  };
}

/**
 * State-layer transaction boundary. A draft is never published unless its complete
 * operation returns, so repository consumers cannot observe a partial export.
 */
export class InMemoryExportPersistenceStateRepository implements ExportPersistenceStateRepository {
  private state: ExportPersistenceSnapshot;

  constructor(seed: ExportPersistenceSeed) {
    this.state = {
      projects: clone(seed.projects),
      artifacts: clone(seed.artifacts ?? []),
      checkpoints: clone(seed.checkpoints ?? []),
      attempts: clone(seed.attempts ?? []),
    };
  }

  snapshot(): ExportPersistenceSnapshot {
    return clone(this.state);
  }

  transaction<T>(operation: (draft: ExportPersistenceSnapshot) => T): T {
    const draft = clone(this.state);
    const result = operation(draft);
    this.state = draft;
    return clone(result);
  }
}

/**
 * Local durable state for the Workbench entrypoint. A completed transaction is
 * atomically published as a full JSON snapshot, so a fresh process can resume
 * only committed export state.
 */
export class FileExportPersistenceStateRepository implements ExportPersistenceStateRepository {
  private state: ExportPersistenceSnapshot;

  constructor(private readonly statePath: string, seed: ExportPersistenceSeed) {
    this.state = existsSync(statePath)
      ? this.readPersistedSnapshot()
      : {
        projects: clone(seed.projects),
        artifacts: clone(seed.artifacts ?? []),
        checkpoints: clone(seed.checkpoints ?? []),
        attempts: clone(seed.attempts ?? []),
      };
    if (!existsSync(statePath)) {
      this.persist(this.state);
    }
  }

  snapshot(): ExportPersistenceSnapshot {
    return clone(this.state);
  }

  transaction<T>(operation: (draft: ExportPersistenceSnapshot) => T): T {
    const draft = clone(this.state);
    const result = operation(draft);
    this.persist(draft);
    this.state = draft;
    return clone(result);
  }

  private readPersistedSnapshot(): ExportPersistenceSnapshot {
    const parsed: unknown = JSON.parse(readFileSync(this.statePath, 'utf8'));
    const snapshot = parsed as Partial<ExportPersistenceSnapshot>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(snapshot.projects)
      || !Array.isArray(snapshot.artifacts) || !Array.isArray(snapshot.checkpoints)
      || !Array.isArray(snapshot.attempts)) {
      throw new Error('export persistence state is malformed');
    }
    return clone(snapshot as ExportPersistenceSnapshot);
  }

  private persist(snapshot: ExportPersistenceSnapshot): void {
    mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600 });
      renameSync(temporaryPath, this.statePath);
    } finally {
      if (existsSync(temporaryPath)) {
        rmSync(temporaryPath, { force: true });
      }
    }
  }
}

/**
 * Repository-backed implementation of the export UoW. The supplied state repository
 * owns publication; this adapter owns only export-domain validation and transitions.
 */
export class StateBackedExportPersistenceUnitOfWork implements ExportPersistenceUnitOfWork {
  commitInvocationCount = 0;

  constructor(
    private readonly state: ExportPersistenceStateRepository,
    private readonly options: { failOn?: FailurePoint } = {},
  ) {}

  snapshot(): ExportPersistenceSnapshot {
    return this.state.snapshot();
  }

  async reserve(input: ExportReservationInput) {
    return this.state.transaction((draft) => {
      const project = draft.projects.find((item) => item.projectId === input.projectId);
      const existing = draft.attempts.find((item) => item.exportKey === input.exportKey);
      if (existing?.status === 'completed') {
        return { kind: 'completed' as const, attempt: clone(existing), delivery: deliveryFrom(existing) };
      }
      if (existing && isActive(existing.status)) {
        return { kind: 'active' as const, attempt: clone(existing) };
      }
      if (existing?.status === 'failed_recoverable') {
        existing.status = 'reserved';
        existing.leaseOwner = input.leaseOwner;
        existing.leaseExpiresAt = input.leaseExpiresAt;
        existing.attemptNumber += 1;
        existing.errorClass = undefined;
        existing.errorMessage = undefined;
        existing.updatedAt = input.now;
        return { kind: 'reserved' as const, attempt: clone(existing) };
      }
      if (existing) {
        return { kind: 'rejected' as const, reason: 'missing_or_invalid_attempt' as const };
      }
      if (!project || (project.status !== 'preview_available' && project.status !== 'post_processing')) {
        return { kind: 'rejected' as const, reason: 'project_not_preview_available' as const };
      }
      if (project.lastRunId !== input.runId) {
        return { kind: 'rejected' as const, reason: 'project_run_mismatch' as const };
      }
      if (draft.attempts.some((attempt) => attempt.projectId === input.projectId && attempt.runId === input.runId && isActive(attempt.status))) {
        return { kind: 'rejected' as const, reason: 'project_run_lease_conflict' as const };
      }

      const attempt: ExportAttempt = {
        id: input.attemptId,
        projectId: input.projectId,
        exportKey: input.exportKey,
        idempotencyKey: input.idempotencyKey,
        format: input.format,
        runId: input.runId,
        previewCheckpointId: input.previewCheckpointId,
        previewArtifactIds: [...input.previewArtifactIds],
        previewArtifactDigest: input.previewArtifactDigest,
        status: 'reserved',
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        attemptNumber: 1,
        committedArtifactIds: [],
        createdAt: input.now,
        updatedAt: input.now,
      };
      draft.attempts.push(attempt);
      return { kind: 'reserved' as const, attempt: clone(attempt) };
    });
  }

  async commit(input: ExportCommitInput): Promise<ExportDelivery> {
    this.commitInvocationCount += 1;
    return this.state.transaction((draft) => {
      const attempt = draft.attempts.find((item) => item.id === input.attemptId);
      if (!attempt || !isActive(attempt.status) || attempt.leaseOwner !== input.leaseOwner) {
        throw new Error('commit invariant violation: attempt is not owned by the caller');
      }
      if (input.project.projectId !== attempt.projectId || input.project.status !== 'export_ready' || input.project.lastRunId !== attempt.runId) {
        throw new Error('commit invariant violation: project is not the locked export target');
      }
      if (
        input.checkpoint.projectId !== attempt.projectId ||
        input.checkpoint.stage !== 'export_ready' ||
        input.checkpoint.status !== 'completed' ||
        (input.checkpoint.statusBefore !== 'preview_available' && input.checkpoint.statusBefore !== 'post_processing') ||
        input.checkpoint.statusAfter !== 'export_ready' ||
        input.project.latestCheckpointId !== input.checkpoint.checkpointId
      ) {
        throw new Error('commit invariant violation: export checkpoint is not completed');
      }
      const primary = input.artifacts.find((item) => item.kind === 'export_pptx' && item.status === 'ready' && item.runId === attempt.runId);
      if (!primary || !input.checkpoint.artifactIds.includes(primary.artifactId) || input.checkpoint.artifactIds.some((id) => !input.artifacts.some((artifact) => artifact.artifactId === id))) {
        throw new Error('commit invariant violation: checkpoint does not cover ready export artifacts');
      }
      if (this.options.failOn === 'project') throw new Error('forced project commit failure');
      const projectIndex = draft.projects.findIndex((item) => item.projectId === input.project.projectId);
      if (projectIndex === -1) throw new Error('commit invariant violation: project disappeared');
      draft.projects[projectIndex] = clone(input.project);

      if (this.options.failOn === 'artifacts') throw new Error('forced artifacts commit failure');
      draft.artifacts.push(...clone(input.artifacts));

      if (this.options.failOn === 'checkpoint') throw new Error('forced checkpoint commit failure');
      draft.checkpoints.push(clone(input.checkpoint));

      if (this.options.failOn === 'attempt') throw new Error('forced attempt commit failure');
      attempt.status = 'completed';
      attempt.committedArtifactIds = input.checkpoint.artifactIds.slice();
      attempt.committedCheckpointId = input.checkpoint.checkpointId;
      attempt.leaseOwner = undefined;
      attempt.leaseExpiresAt = undefined;
      attempt.updatedAt = input.now;
      return deliveryFrom(attempt);
    });
  }

  async fail(input: ExportFailureInput): Promise<ExportAttempt> {
    return this.state.transaction((draft) => {
      const attempt = draft.attempts.find((item) => item.id === input.attemptId);
      if (!attempt || !isActive(attempt.status)) {
        throw new Error('attempt cannot transition to failure');
      }
      attempt.status = input.errorClass === 'integrity_terminal' ? 'failed_terminal' : 'failed_recoverable';
      attempt.errorClass = input.errorClass;
      attempt.errorMessage = input.errorMessage;
      attempt.leaseOwner = undefined;
      attempt.leaseExpiresAt = undefined;
      attempt.updatedAt = input.now;
      return clone(attempt);
    });
  }
}

/** Backwards-compatible state-store façade for focused contract tests. */
export class InMemoryExportPersistenceStore {
  private readonly state: InMemoryExportPersistenceStateRepository;
  private readonly unitOfWork: StateBackedExportPersistenceUnitOfWork;

  constructor(seed: ExportPersistenceSeed, options: { failOn?: FailurePoint } = {}) {
    this.state = new InMemoryExportPersistenceStateRepository(seed);
    this.unitOfWork = new StateBackedExportPersistenceUnitOfWork(this.state, options);
  }

  get commitInvocationCount(): number {
    return this.unitOfWork.commitInvocationCount;
  }

  open(): ExportPersistenceUnitOfWork & { snapshot(): ExportPersistenceSnapshot } {
    return {
      reserve: (input) => this.unitOfWork.reserve(input),
      commit: (input) => this.unitOfWork.commit(input),
      fail: (input) => this.unitOfWork.fail(input),
      snapshot: () => this.state.snapshot(),
    };
  }
}
