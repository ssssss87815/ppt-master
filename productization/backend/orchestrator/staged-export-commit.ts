import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import { runStagedExportBridge, type StagedExportRequest } from '../adapter/staged-export-bridge';
import type { ProductArtifactRef } from '../models/artifacts';
import type { ExportDelivery, ExportRejection } from '../models/export-attempt';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';
import type {
  ExportPersistenceUnitOfWork,
  ExportReservationInput,
} from '../state/export-persistence-unit-of-work';

export type StagedExportCommitRequest = Omit<
  ExportReservationInput,
  'attemptId' | 'previewCheckpointId' | 'previewArtifactIds' | 'previewArtifactDigest'
> & {
  attemptId: string;
  rootDir: string;
  preview: StagedExportRequest['preview'];
  invokeRuntime?: StagedExportRequest['invokeRuntime'];
};

export type StagedExportCommitResult =
  | { kind: 'delivered'; delivery: ExportDelivery }
  | { kind: 'completed'; delivery: ExportDelivery }
  | { kind: 'active'; attemptId: string }
  | { kind: 'rejected'; reason: ExportRejection | 'invalid_preview_evidence' }
  | { kind: 'failed'; attemptId: string; errorClass: 'runtime_recoverable' | 'integrity_terminal'; cleanup: 'cleaned' | 'orphaned' | 'not_required' };

function previewDigest(artifacts: ProductArtifactRef[]): string {
  return createHash('sha256')
    .update(artifacts.map((artifact) => `${artifact.artifactId}:${artifact.storageKey}`).sort().join('\n'))
    .digest('hex');
}

function toArtifact(
  request: StagedExportCommitRequest,
  file: { path: string; bytes: number; sha256: string },
  kind: ProductArtifactRef['kind'],
  label: string,
): ProductArtifactRef {
  return {
    artifactId: `${request.attemptId}:${kind}:${file.sha256.slice(0, 12)}`,
    projectId: request.projectId,
    kind,
    scope: 'run',
    status: 'ready',
    label,
    runId: request.runId,
    storageKey: path.relative(request.rootDir, file.path),
    metadata: { bytes: file.bytes, sha256: file.sha256, stagedExport: false },
    createdAt: request.now,
    updatedAt: request.now,
  };
}

function committedProject(project: ProjectRecord, checkpointId: string, now: string): ProjectRecord {
  return { ...project, status: 'export_ready', latestCheckpointId: checkpointId, updatedAt: now };
}

function durableStoragePath(rootDir: string, attemptId: string, sourcePath: string): string {
  return path.join(rootDir, 'exports', attemptId, path.basename(sourcePath));
}

function promoteStagedFiles(rootDir: string, attemptId: string, stagedFiles: Array<{ path: string }>): string[] {
  const promoted: string[] = [];
  try {
    for (const file of stagedFiles) {
      const destination = durableStoragePath(rootDir, attemptId, file.path);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(file.path, destination);
      promoted.push(destination);
    }
    return promoted;
  } catch (error) {
    for (const destination of promoted) rmSync(destination, { force: true });
    throw error;
  }
}

/** Server-owned orchestration seam: no HTTP/UI surface is exposed from this module. */
export async function runStagedExportThroughAtomicCommit(
  unitOfWork: ExportPersistenceUnitOfWork,
  request: StagedExportCommitRequest,
): Promise<StagedExportCommitResult> {
  const reservation = await unitOfWork.reserve({
    ...request,
    previewCheckpointId: request.preview.lockedPreviewCheckpoint.checkpointId,
    previewArtifactIds: [request.preview.manifest, ...request.preview.previewArtifacts, request.preview.postProcessingReport].map((artifact) => artifact.artifactId),
    previewArtifactDigest: previewDigest([request.preview.manifest, ...request.preview.previewArtifacts, request.preview.postProcessingReport]),
  });

  if (reservation.kind === 'completed') return { kind: 'completed', delivery: reservation.delivery };
  if (reservation.kind === 'active') return { kind: 'active', attemptId: reservation.attempt.id };
  if (reservation.kind === 'rejected') return { kind: 'rejected', reason: reservation.reason };

  const staged = runStagedExportBridge({
    exportKey: request.exportKey,
    attemptNumber: reservation.attempt.attemptNumber,
    rootDir: request.rootDir,
    preview: request.preview,
    invokeRuntime: request.invokeRuntime,
  });
  if (staged.kind === 'rejected') {
    await unitOfWork.fail({ attemptId: reservation.attempt.id, errorClass: 'integrity_terminal', errorMessage: staged.message, now: request.now });
    return { kind: 'rejected', reason: staged.reason };
  }
  if (staged.kind === 'failed') {
    const errorClass = staged.failure === 'invalid_staged_output' ? 'integrity_terminal' : 'runtime_recoverable';
    await unitOfWork.fail({ attemptId: reservation.attempt.id, errorClass, errorMessage: staged.message, now: request.now });
    return { kind: 'failed', attemptId: reservation.attempt.id, errorClass, cleanup: staged.cleanup.kind };
  }

  try {
    const promoted = promoteStagedFiles(request.rootDir, reservation.attempt.id, [staged.pptx, ...staged.companions]);
    const artifacts = [
      toArtifact(request, { ...staged.pptx, path: promoted[0]! }, 'export_pptx', 'Committed PPTX export'),
      ...staged.companions.map((file, index) => toArtifact(request, { ...file, path: promoted[index + 1]! }, index === 0 ? 'runtime_log' : 'image_manifest', 'Committed export companion')),
    ];
    const checkpointId = `${request.attemptId}:export-ready`;
    const project = committedProject(request.preview.project, checkpointId, request.now);
    const checkpoint: WorkflowCheckpoint = {
      checkpointId,
      projectId: request.projectId,
      stage: 'export_ready',
      status: 'completed',
      statusBefore: request.preview.project.status,
      statusAfter: 'export_ready',
      artifactIds: artifacts.map((artifact) => artifact.artifactId),
      note: 'Staged export validated and committed atomically.',
      createdAt: request.now,
    };
    const delivery = await unitOfWork.commit({ attemptId: reservation.attempt.id, leaseOwner: request.leaseOwner, project, artifacts, checkpoint, now: request.now });
    rmSync(staged.stageDir, { recursive: true, force: true });
    return { kind: 'delivered', delivery };
  } catch (error) {
    try {
      rmSync(path.join(request.rootDir, 'exports', reservation.attempt.id), { recursive: true, force: true });
    } catch {
      // Best-effort cleanup must not prevent the durable recoverable-failure transition.
    }
    try {
      rmSync(staged.stageDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup must not prevent the durable recoverable-failure transition.
    }
    await unitOfWork.fail({
      attemptId: reservation.attempt.id,
      errorClass: 'persistence_recoverable',
      errorMessage: error instanceof Error ? error.message : String(error),
      now: request.now,
    });
    throw error;
  }
}
