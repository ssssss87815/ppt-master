import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';

import { runStagedExportThroughAtomicCommit } from '../backend/orchestrator/staged-export-commit.ts';
import { InMemoryExportPersistenceStore } from '../backend/state/export-persistence-unit-of-work.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';

const NOW = '2026-07-11T11:00:00.000Z';
const PROJECT_ID = 'atomic-staged-project';
const EXPORT_KEY = 'atomic-staged-project-run-1';

function project(): ProjectRecord {
  return {
    projectId: PROJECT_ID, name: 'Atomic staged export', status: 'preview_available',
    workspace: { projectId: PROJECT_ID, workspacePath: '/tmp/atomic-staged-project' },
    lastRunId: 'run-1', latestCheckpointId: 'preview-1', createdAt: NOW, updatedAt: NOW,
  };
}

function artifact(artifactId: string, kind: ProductArtifactRef['kind']): ProductArtifactRef {
  return {
    artifactId, projectId: PROJECT_ID, kind, scope: 'run', status: 'ready', runId: 'run-1',
    storageKey: `/preview/${artifactId}`, createdAt: NOW, updatedAt: NOW,
  };
}

function preview() {
  const manifest = artifact('preview-bundle', 'preview_bundle');
  const page = artifact('preview-page-1', 'preview_page_svg');
  const lockedPreviewCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'preview-1', projectId: PROJECT_ID, stage: 'preview_synced', status: 'completed',
    statusBefore: 'generation_in_progress', statusAfter: 'preview_available', artifactIds: [manifest.artifactId, page.artifactId], createdAt: NOW,
  };
  return { project: project(), currentRunId: 'run-1', lockedPreviewCheckpoint, manifest, previewArtifacts: [page] };
}

function postProcessedPreview() {
  const baseline = preview();
  const project = { ...baseline.project, status: 'post_processing' as const, latestCheckpointId: 'post-processed' };
  const manifest = { ...baseline.manifest, artifactId: 'final-bundle', kind: 'final_bundle' as const };
  const page = { ...baseline.previewArtifacts[0]!, artifactId: 'final-page-1', kind: 'final_page_svg' as const };
  const lockedPreviewCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'post-processed', projectId: PROJECT_ID, stage: 'post_processed', status: 'completed',
    statusBefore: 'preview_available', statusAfter: 'post_processing', artifactIds: [manifest.artifactId, page.artifactId], createdAt: NOW,
  };
  return { project, currentRunId: 'run-1', lockedPreviewCheckpoint, manifest, previewArtifacts: [page] };
}

function request(rootDir: string, overrides: Partial<Parameters<typeof runStagedExportThroughAtomicCommit>[1]> = {}) {
  return {
    attemptId: 'attempt-1', projectId: PROJECT_ID, exportKey: EXPORT_KEY, idempotencyKey: 'idempotency-1', format: 'pptx' as const,
    runId: 'run-1', leaseOwner: 'worker-1', leaseExpiresAt: '2026-07-11T11:05:00.000Z', now: NOW,
    rootDir, preview: preview(),
    invokeRuntime: (_project: ProjectRecord, stageDir: string) => {
      const pptx = path.join(stageDir, 'deck.pptx');
      const companion = path.join(stageDir, 'deck.md');
      const manifest = path.join(stageDir, 'deck_files', 'image_manifest.json');
      mkdirSync(path.dirname(manifest), { recursive: true });
      writeFileSync(pptx, 'pptx'); writeFileSync(companion, 'companion'); writeFileSync(manifest, '{}');
      return { runtimeStatus: 'exported' as const, note: 'ok', output: { pptxPath: pptx, markdownCompanionPath: companion, imageManifestPath: manifest } };
    },
    ...overrides,
  };
}

async function main() {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'atomic-staged-export-'));
  try {
    let runtimeCalls = 0;
    const blockedStore = new InMemoryExportPersistenceStore({ projects: [{ ...project(), status: 'draft' }] });
    const blocked = await runStagedExportThroughAtomicCommit(blockedStore.open(), request(rootDir, {
      invokeRuntime: () => { runtimeCalls += 1; throw new Error('runtime must not be invoked'); },
    }));
    assert.deepEqual(blocked, { kind: 'rejected', reason: 'project_not_preview_available' });
    assert.equal(runtimeCalls, 0, 'reservation rejection must happen before runtime staging');

    const failedStore = new InMemoryExportPersistenceStore({ projects: [project()] });
    const failed = await runStagedExportThroughAtomicCommit(failedStore.open(), request(rootDir, {
      invokeRuntime: () => ({ runtimeStatus: 'failed' as const, note: 'converter unavailable' }),
    }));
    assert.deepEqual(failed, { kind: 'failed', attemptId: 'attempt-1', errorClass: 'runtime_recoverable', cleanup: 'cleaned' });
    assert.equal(failedStore.open().snapshot().attempts[0]?.status, 'failed_recoverable', 'staged runtime failure must be durable');
    assert.equal(existsSync(path.join(rootDir, '.staging', EXPORT_KEY, '1')), false, 'failed staging must be cleaned');

    const store = new InMemoryExportPersistenceStore({ projects: [project()] });
    const delivered = await runStagedExportThroughAtomicCommit(store.open(), request(rootDir));
    assert.equal(delivered.kind, 'delivered');
    const freshRead = store.open().snapshot();
    assert.equal(freshRead.projects[0]?.status, 'export_ready', 'fresh reads expose project only after atomic commit');
    assert.equal(freshRead.artifacts.length, 3, 'fresh reads expose all durable export files together');
    assert.equal(freshRead.checkpoints.length, 1, 'fresh reads expose checkpoint only after commit');
    assert.equal(freshRead.attempts[0]?.status, 'completed', 'fresh reads expose completed attempt only after commit');
    assert.ok(freshRead.artifacts.every((item) => !item.storageKey.includes('.staging')), 'durable delivery cannot point at staging');

    const repeat = await runStagedExportThroughAtomicCommit(store.open(), request(rootDir, { attemptId: 'attempt-2', leaseOwner: 'worker-2' }));
    assert.equal(repeat.kind, 'completed', 'same export key must reuse the completed durable delivery');
    assert.equal(store.commitInvocationCount, 1, 'idempotent replay must not commit again');

    const postProcessed = postProcessedPreview();
    const postProcessedStore = new InMemoryExportPersistenceStore({ projects: [postProcessed.project] });
    const finalDelivery = await runStagedExportThroughAtomicCommit(postProcessedStore.open(), request(rootDir, { preview: postProcessed }));
    assert.equal(finalDelivery.kind, 'delivered', 'a post-processed final roster may commit a staged export');
    assert.equal(postProcessedStore.open().snapshot().checkpoints[0]?.statusBefore, 'post_processing');

    const retryStore = new InMemoryExportPersistenceStore({ projects: [project()] });
    await runStagedExportThroughAtomicCommit(retryStore.open(), request(rootDir, {
      invokeRuntime: () => ({ runtimeStatus: 'failed' as const, note: 'temporary failure' }),
    }));
    const retry = await runStagedExportThroughAtomicCommit(retryStore.open(), request(rootDir, { leaseOwner: 'worker-retry' }));
    assert.equal(retry.kind, 'delivered', 'recoverable staged failure must reserve a new retry attempt');
    assert.equal(retryStore.open().snapshot().attempts[0]?.attemptNumber, 2, 'retry must increment the durable attempt number');

    console.log('staged export atomic commit integration: ok');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

void main();
