import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';
import { runExportToStaging, type StagedRuntimeResult } from './export-runtime-bridge';

export type ValidatedPreviewEvidence = {
  project: ProjectRecord;
  currentRunId: string;
  lockedPreviewCheckpoint: WorkflowCheckpoint;
  manifest: ProductArtifactRef;
  previewArtifacts: ProductArtifactRef[];
};

export type StagedExportRequest = {
  exportKey: string;
  attemptNumber: number;
  rootDir: string;
  preview: ValidatedPreviewEvidence;
  invokeRuntime?: (project: ProjectRecord, stageDir: string) => StagedRuntimeResult;
};

export type StagedFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type CleanupClassification =
  | { kind: 'not_required' }
  | { kind: 'cleaned' }
  | { kind: 'orphaned'; auditKey: string; message: string };

export type StagedExportResult =
  | {
      kind: 'staged';
      exportKey: string;
      attemptNumber: number;
      stageDir: string;
      sourcePreview: ValidatedPreviewEvidence;
      pptx: StagedFile;
      companions: StagedFile[];
      cleanup: CleanupClassification;
    }
  | {
      kind: 'rejected';
      reason: 'invalid_preview_evidence';
      message: string;
      cleanup: CleanupClassification;
    }
  | {
      kind: 'failed';
      failure: 'runtime_error' | 'invalid_staged_output';
      message: string;
      stageDir: string;
      cleanup: CleanupClassification;
    };

function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..');
}

export function toStagingDirectory(rootDir: string, exportKey: string, attemptNumber: number): string {
  if (!isSafePathSegment(exportKey) || !Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error('staged export requires a safe exportKey and positive integer attemptNumber');
  }
  return path.resolve(rootDir, '.staging', exportKey, String(attemptNumber));
}

export function isStagedStorageKey(storageKey: string): boolean {
  return storageKey.split(/[\\/]+/).includes('.staging');
}

export function excludeStagedArtifactsFromFreshRead(artifacts: ProductArtifactRef[]): ProductArtifactRef[] {
  return artifacts.filter((artifact) => !isStagedStorageKey(artifact.storageKey));
}

function validatePreview(evidence: ValidatedPreviewEvidence): string | null {
  const { project, currentRunId, lockedPreviewCheckpoint, manifest, previewArtifacts } = evidence;
  if ((project.status !== 'preview_available' && project.status !== 'post_processing') || project.lastRunId !== currentRunId) {
    return 'project is not the current export-eligible run';
  }
  const postProcessed = project.status === 'post_processing';
  const expectedCheckpointStage = postProcessed ? 'post_processed' : 'preview_synced';
  const expectedBundleKind = postProcessed ? 'final_bundle' : 'preview_bundle';
  const expectedPageKind = postProcessed ? 'final_page_svg' : 'preview_page_svg';
  if (
    lockedPreviewCheckpoint.projectId !== project.projectId ||
    lockedPreviewCheckpoint.stage !== expectedCheckpointStage ||
    lockedPreviewCheckpoint.status !== 'completed'
  ) {
    return 'preview checkpoint is not a completed checkpoint for this project';
  }
  if (manifest.projectId !== project.projectId || manifest.runId !== currentRunId || manifest.kind !== expectedBundleKind || manifest.status !== 'ready') {
    return 'export bundle is not ready for the current run';
  }
  if (!lockedPreviewCheckpoint.artifactIds.includes(manifest.artifactId)) {
    return 'preview checkpoint does not lock the preview manifest';
  }
  if (!previewArtifacts.length || previewArtifacts.some((artifact) =>
    artifact.projectId !== project.projectId ||
    artifact.runId !== currentRunId ||
    artifact.kind !== expectedPageKind ||
    artifact.status !== 'ready' ||
    !lockedPreviewCheckpoint.artifactIds.includes(artifact.artifactId),
  )) {
    return 'export page artifacts are missing, stale, or cross-run';
  }
  return null;
}

function fileProof(filePath: string): StagedFile | null {
  if (!existsSync(filePath) || !lstatSync(filePath).isFile()) return null;
  const body = readFileSync(filePath);
  if (!body.length) return null;
  return { path: filePath, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
}

function cleanup(stageDir: string, exportKey: string, attemptNumber: number): CleanupClassification {
  try {
    rmSync(stageDir, { recursive: true, force: true });
    return { kind: 'cleaned' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'orphaned', auditKey: `${exportKey}/${attemptNumber}`, message };
  }
}

export function runStagedExportBridge(request: StagedExportRequest): StagedExportResult {
  const invalidEvidence = validatePreview(request.preview);
  if (invalidEvidence) {
    return { kind: 'rejected', reason: 'invalid_preview_evidence', message: invalidEvidence, cleanup: { kind: 'not_required' } };
  }

  let stageDir: string;
  try {
    stageDir = toStagingDirectory(request.rootDir, request.exportKey, request.attemptNumber);
    mkdirSync(stageDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'failed', failure: 'runtime_error', message, stageDir: '', cleanup: { kind: 'not_required' } };
  }

  const runtime = (request.invokeRuntime ?? runExportToStaging)(request.preview.project, stageDir);
  if (runtime.runtimeStatus !== 'exported') {
    return { kind: 'failed', failure: 'runtime_error', message: runtime.note, stageDir, cleanup: cleanup(stageDir, request.exportKey, request.attemptNumber) };
  }

  const pptx = fileProof(runtime.output.pptxPath);
  const companions = [fileProof(runtime.output.markdownCompanionPath), fileProof(runtime.output.imageManifestPath)];
  if (!pptx || companions.some((item) => item === null)) {
    return {
      kind: 'failed',
      failure: 'invalid_staged_output',
      message: 'staged export must contain a non-empty PPTX and both non-empty companion files',
      stageDir,
      cleanup: cleanup(stageDir, request.exportKey, request.attemptNumber),
    };
  }

  return {
    kind: 'staged', exportKey: request.exportKey, attemptNumber: request.attemptNumber, stageDir,
    sourcePreview: request.preview, pptx, companions: companions as StagedFile[], cleanup: { kind: 'not_required' },
  };
}
