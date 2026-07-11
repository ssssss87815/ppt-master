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

type FailurePoint = 'project' | 'artifacts' | 'checkpoint' | 'attempt';
type Seed = Pick<ExportPersistenceSnapshot, 'projects'> & Partial<Omit<ExportPersistenceSnapshot, 'projects'>>;

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

export class InMemoryExportPersistenceStore {
  private state: ExportPersistenceSnapshot;
  private readonly failOn?: FailurePoint;
  commitInvocationCount = 0;

  constructor(seed: Seed, options: { failOn?: FailurePoint } = {}) {
    this.state = {
      projects: clone(seed.projects),
      artifacts: clone(seed.artifacts ?? []),
      checkpoints: clone(seed.checkpoints ?? []),
      attempts: clone(seed.attempts ?? []),
    };
    this.failOn = options.failOn;
  }

  open(): ExportPersistenceUnitOfWork & { snapshot(): ExportPersistenceSnapshot } {
    return {
      reserve: async (input) => this.reserve(input),
      commit: async (input) => this.commit(input),
      fail: async (input) => this.fail(input),
      snapshot: () => clone(this.state),
    };
  }

  private reserve(input: ExportReservationInput) {
    const project = this.state.projects.find((item) => item.projectId === input.projectId);
    const existing = this.state.attempts.find((item) => item.exportKey === input.exportKey);
    if (existing?.status === 'completed') {
      return Promise.resolve({ kind: 'completed' as const, attempt: clone(existing), delivery: deliveryFrom(existing) });
    }
    if (existing && isActive(existing.status)) {
      return Promise.resolve({ kind: 'active' as const, attempt: clone(existing) });
    }
    if (existing) {
      return Promise.resolve({ kind: 'rejected' as const, reason: 'missing_or_invalid_attempt' as const });
    }
    if (!project || project.status !== 'preview_available') {
      return Promise.resolve({ kind: 'rejected' as const, reason: 'project_not_preview_available' as const });
    }
    if (project.lastRunId !== input.runId) {
      return Promise.resolve({ kind: 'rejected' as const, reason: 'project_run_mismatch' as const });
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
    this.state.attempts.push(attempt);
    return Promise.resolve({ kind: 'reserved' as const, attempt: clone(attempt) });
  }

  private commit(input: ExportCommitInput): Promise<ExportDelivery> {
    this.commitInvocationCount += 1;
    const draft = clone(this.state);
    const attempt = draft.attempts.find((item) => item.id === input.attemptId);
    if (!attempt || !isActive(attempt.status) || attempt.leaseOwner !== input.leaseOwner) {
      return Promise.reject(new Error('commit invariant violation: attempt is not owned by the caller'));
    }
    if (input.project.projectId !== attempt.projectId || input.project.status !== 'export_ready' || input.project.lastRunId !== attempt.runId) {
      return Promise.reject(new Error('commit invariant violation: project is not the locked export target'));
    }
    if (
      input.checkpoint.projectId !== attempt.projectId ||
      input.checkpoint.stage !== 'export_ready' ||
      input.checkpoint.status !== 'completed' ||
      input.project.latestCheckpointId !== input.checkpoint.checkpointId
    ) {
      return Promise.reject(new Error('commit invariant violation: export checkpoint is not completed'));
    }
    const primary = input.artifacts.find((item) => item.kind === 'export_pptx' && item.status === 'ready' && item.runId === attempt.runId);
    if (!primary || !input.checkpoint.artifactIds.includes(primary.artifactId) || input.checkpoint.artifactIds.some((id) => !input.artifacts.some((artifact) => artifact.artifactId === id))) {
      return Promise.reject(new Error('commit invariant violation: checkpoint does not cover ready export artifacts'));
    }

    if (this.failOn === 'project') return Promise.reject(new Error('forced project commit failure'));
    const projectIndex = draft.projects.findIndex((item) => item.projectId === input.project.projectId);
    if (projectIndex === -1) return Promise.reject(new Error('commit invariant violation: project disappeared'));
    draft.projects[projectIndex] = clone(input.project);

    if (this.failOn === 'artifacts') return Promise.reject(new Error('forced artifacts commit failure'));
    draft.artifacts.push(...clone(input.artifacts));

    if (this.failOn === 'checkpoint') return Promise.reject(new Error('forced checkpoint commit failure'));
    draft.checkpoints.push(clone(input.checkpoint));

    if (this.failOn === 'attempt') return Promise.reject(new Error('forced attempt commit failure'));
    attempt.status = 'completed';
    attempt.committedArtifactIds = input.checkpoint.artifactIds.slice();
    attempt.committedCheckpointId = input.checkpoint.checkpointId;
    attempt.leaseOwner = undefined;
    attempt.leaseExpiresAt = undefined;
    attempt.updatedAt = input.now;

    this.state = draft;
    return Promise.resolve(deliveryFrom(attempt));
  }

  private fail(input: ExportFailureInput): Promise<ExportAttempt> {
    const attempt = this.state.attempts.find((item) => item.id === input.attemptId);
    if (!attempt || !isActive(attempt.status)) {
      return Promise.reject(new Error('attempt cannot transition to failure'));
    }
    attempt.status = input.errorClass === 'integrity_terminal' ? 'failed_terminal' : 'failed_recoverable';
    attempt.errorClass = input.errorClass;
    attempt.errorMessage = input.errorMessage;
    attempt.leaseOwner = undefined;
    attempt.leaseExpiresAt = undefined;
    attempt.updatedAt = input.now;
    return Promise.resolve(clone(attempt));
  }
}
