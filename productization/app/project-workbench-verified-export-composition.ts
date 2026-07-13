import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { ProductArtifactRef } from '../backend/models/artifacts.js';
import type { ExportDelivery } from '../backend/models/export-attempt.js';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.js';
import { runStagedExportThroughAtomicCommit } from '../backend/orchestrator/staged-export-commit.js';
import type { ValidatedPreviewEvidence } from '../backend/adapter/staged-export-bridge.js';
import {
  FileExportPersistenceStateRepository,
  StateBackedExportPersistenceUnitOfWork,
  type ExportPersistenceSeed,
  type ExportPersistenceSnapshot,
  type ExportPersistenceStateRepository,
} from '../backend/state/export-persistence-unit-of-work.js';
import type { ProjectWorkbenchExportInput, ProjectWorkbenchExportResult } from './project-workbench-page.js';

export type VerifiedExportWorkbenchOptions = {
  rootDir: string;
  statePath?: string;
  initialState?: ExportPersistenceSeed;
  now?: () => string;
  leaseDurationMs?: number;
};

export type VerifiedExportWorkbenchDependencies = {
  projects: {
    getById(projectId: string): Promise<ProjectRecord | null>;
    update(project: ProjectRecord): Promise<ProjectRecord>;
  };
  artifacts: {
    listByProjectId(projectId: string): Promise<ProductArtifactRef[]>;
    createMany(artifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]>;
  };
  checkpoints: {
    getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null>;
    listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]>;
    create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint>;
  };
  exportPptx(input: ProjectWorkbenchExportInput): Promise<ProjectWorkbenchExportResult>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function projectArtifacts(snapshot: ExportPersistenceSnapshot, projectId: string): ProductArtifactRef[] {
  return snapshot.artifacts.filter((artifact) => artifact.projectId === projectId);
}

function projectCheckpoints(snapshot: ExportPersistenceSnapshot, projectId: string): WorkflowCheckpoint[] {
  return snapshot.checkpoints.filter((checkpoint) => checkpoint.projectId === projectId);
}

function latestCheckpoint(snapshot: ExportPersistenceSnapshot, projectId: string): WorkflowCheckpoint | null {
  return projectCheckpoints(snapshot, projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function previewPageDigest(artifact: ProductArtifactRef): string | null {
  if (!artifact.storageKey) return null;
  const filePath = path.resolve(artifact.storageKey);
  if (!existsSync(filePath)) return null;
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function hasCurrentWorkspacePreviewEvidence(previewArtifacts: ProductArtifactRef[]): boolean {
  return previewArtifacts.every((artifact) => {
    const provenance = artifact.metadata?.generationProvenance;
    const expectedDigest = provenance && typeof provenance === 'object'
      ? (provenance as { sha256?: unknown }).sha256
      : undefined;
    return typeof expectedDigest === 'string' && expectedDigest.length > 0 && previewPageDigest(artifact) === expectedDigest;
  });
}

function deriveCurrentPreviewEvidence(snapshot: ExportPersistenceSnapshot, projectId: string): ValidatedPreviewEvidence | null {
  const project = snapshot.projects.find((item) => item.projectId === projectId);
  const currentRunId = project?.lastRunId;
  if (!project || !currentRunId || (project.status !== 'preview_available' && project.status !== 'export_ready')) {
    return null;
  }

  const checkpoints = projectCheckpoints(snapshot, projectId);
  const lockedPreviewCheckpoint = checkpoints
    .filter((checkpoint) => checkpoint.stage === 'preview_synced' && checkpoint.status === 'completed')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!lockedPreviewCheckpoint) {
    return null;
  }

  const lockedArtifacts = projectArtifacts(snapshot, projectId).filter((artifact) =>
    artifact.runId === currentRunId
    && artifact.status === 'ready'
    && lockedPreviewCheckpoint.artifactIds.includes(artifact.artifactId),
  );
  const manifest = lockedArtifacts.find((artifact) => artifact.kind === 'preview_bundle');
  const previewArtifacts = lockedArtifacts.filter((artifact) => artifact.kind === 'preview_page_svg');
  const qualityReports = projectArtifacts(snapshot, projectId).filter((artifact) =>
    artifact.kind === 'quality_report'
    && artifact.status === 'ready'
    && artifact.runId === currentRunId
    && artifact.metadata?.sourcePreviewCheckpointId === lockedPreviewCheckpoint.checkpointId
    && artifact.metadata?.summary
    && typeof artifact.metadata.summary === 'object'
    && (artifact.metadata.summary as { passed?: unknown }).passed === true
    && typeof artifact.metadata.sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(artifact.metadata.sha256),
  );
  const qualityCheckpoint = checkpoints.find((checkpoint) =>
    checkpoint.stage === 'quality_checked'
    && checkpoint.status === 'completed'
    && checkpoint.statusBefore === 'preview_available'
    && checkpoint.statusAfter === 'preview_available'
    && checkpoint.artifactIds.length === 1
    && checkpoint.artifactIds[0] === qualityReports[0]?.artifactId,
  );
  if (!manifest || !previewArtifacts.length || !hasCurrentWorkspacePreviewEvidence(previewArtifacts)
    || qualityReports.length !== 1 || !qualityCheckpoint) {
    return null;
  }

  return { project, currentRunId, lockedPreviewCheckpoint, manifest, previewArtifacts };
}

function durableArtifactPath(rootDir: string, storageKey: string): string | null {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, storageKey);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return resolved;
}

function hasDurableArtifactProof(primary: ProductArtifactRef, rootDir: string): boolean {
  const storagePath = durableArtifactPath(rootDir, primary.storageKey);
  const expectedBytes = primary.metadata?.bytes;
  const expectedDigest = primary.metadata?.sha256;
  if (!storagePath || typeof expectedBytes !== 'number' || expectedBytes <= 0 || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedDigest)) {
    return false;
  }
  try {
    return statSync(storagePath).isFile()
      && statSync(storagePath).size === expectedBytes
      && createHash('sha256').update(readFileSync(storagePath)).digest('hex') === expectedDigest;
  } catch {
    return false;
  }
}

function durableDelivery(
  snapshot: ExportPersistenceSnapshot,
  delivery: ExportDelivery,
  kind: ProjectWorkbenchExportResult['kind'],
  rootDir: string,
): ProjectWorkbenchExportResult {
  const attempt = snapshot.attempts.find((item) => item.id === delivery.attemptId && item.status === 'completed');
  const project = snapshot.projects.find((item) => item.projectId === delivery.projectId && item.status === 'export_ready');
  const primary = snapshot.artifacts.find((item) => item.artifactId === delivery.primaryArtifactId && item.kind === 'export_pptx' && item.status === 'ready');
  const checkpoint = snapshot.checkpoints.find((item) => item.checkpointId === delivery.checkpointId && item.stage === 'export_ready' && item.status === 'completed');
  if (!attempt || !project || !primary || !checkpoint || !attempt.committedArtifactIds.includes(primary.artifactId) || !hasDurableArtifactProof(primary, rootDir)) {
    throw new Error('verified export did not produce a fresh durable delivery');
  }
  return { kind, primaryArtifactId: primary.artifactId };
}

/**
 * Production composition for the local Workbench HTTP surface. State is read at
 * request time and export evidence is derived from that state, never accepted from
 * a browser callback or a page projection.
 */
export function createVerifiedExportWorkbenchDependencies(
  state: ExportPersistenceStateRepository,
  options: VerifiedExportWorkbenchOptions,
): VerifiedExportWorkbenchDependencies {
  return createVerifiedExportWorkbenchDependenciesFromState(state, options);
}

/** Creates a durable local Workbench composition that survives process restart. */
export function createDurableVerifiedExportWorkbenchDependencies(
  options: VerifiedExportWorkbenchOptions & { statePath: string; initialState: ExportPersistenceSeed },
): VerifiedExportWorkbenchDependencies {
  return createVerifiedExportWorkbenchDependenciesFromState(
    new FileExportPersistenceStateRepository(options.statePath, options.initialState),
    options,
  );
}

function createVerifiedExportWorkbenchDependenciesFromState(
  state: ExportPersistenceStateRepository,
  options: VerifiedExportWorkbenchOptions,
): VerifiedExportWorkbenchDependencies {
  const now = options.now ?? (() => new Date().toISOString());
  const leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;

  return {
    projects: {
      async getById(projectId) {
        return clone(state.snapshot().projects.find((project) => project.projectId === projectId) ?? null);
      },
      async update(project) {
        return state.transaction((draft) => {
          const index = draft.projects.findIndex((item) => item.projectId === project.projectId);
          if (index === -1) throw new Error('project does not exist');
          draft.projects[index] = clone(project);
          return clone(project);
        });
      },
    },
    artifacts: {
      async listByProjectId(projectId) {
        return clone(projectArtifacts(state.snapshot(), projectId));
      },
      async createMany(artifacts) {
        return state.transaction((draft) => {
          draft.artifacts.push(...clone(artifacts));
          return clone(artifacts);
        });
      },
    },
    checkpoints: {
      async getLatestByProjectId(projectId) {
        return clone(latestCheckpoint(state.snapshot(), projectId));
      },
      async listByProjectId(projectId) {
        return clone(projectCheckpoints(state.snapshot(), projectId));
      },
      async create(checkpoint) {
        return state.transaction((draft) => {
          draft.checkpoints.push(clone(checkpoint));
          return clone(checkpoint);
        });
      },
    },
    async exportPptx(input) {
      const snapshot = state.snapshot();
      const preview = deriveCurrentPreviewEvidence(snapshot, input.project.projectId);
      if (!preview) {
        throw new Error('current-run preview evidence is unavailable');
      }

      const timestamp = now();
      const exportKey = digest(`${preview.project.projectId}\n${preview.currentRunId}\n${input.idempotencyKey}`);
      const unitOfWork = new StateBackedExportPersistenceUnitOfWork(state);
      const result = await runStagedExportThroughAtomicCommit(unitOfWork, {
        attemptId: `export-${exportKey}`,
        projectId: preview.project.projectId,
        exportKey,
        idempotencyKey: input.idempotencyKey,
        format: 'pptx',
        runId: preview.currentRunId,
        leaseOwner: `workbench-${randomUUID()}`,
        leaseExpiresAt: new Date(Date.parse(timestamp) + leaseDurationMs).toISOString(),
        now: timestamp,
        rootDir: options.rootDir,
        preview,
      });
      if (result.kind !== 'delivered' && result.kind !== 'completed') {
        throw new Error('verified export did not commit a durable delivery');
      }
      return durableDelivery(state.snapshot(), result.delivery, result.kind, options.rootDir);
    },
  };
}
