import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  excludeStagedArtifactsFromFreshRead,
  runStagedExportBridge,
  toStagingDirectory,
  type ValidatedPreviewEvidence,
} from '../backend/adapter/staged-export-bridge';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects';

const now = '2026-07-11T10:00:00.000Z';

function evidence(): ValidatedPreviewEvidence {
  const project: ProjectRecord = {
    projectId: 'staged-export-project', name: 'Staged export project', status: 'preview_available',
    workspace: { projectId: 'staged-export-project', workspacePath: '/workspace/project' }, lastRunId: 'run-1', createdAt: now, updatedAt: now,
  };
  const manifest: ProductArtifactRef = {
    artifactId: 'preview-bundle', projectId: project.projectId, kind: 'preview_bundle', scope: 'run', status: 'ready', runId: 'run-1',
    storageKey: '/workspace/project/preview/index.json', createdAt: now, updatedAt: now,
  };
  const page: ProductArtifactRef = {
    artifactId: 'preview-page-1', projectId: project.projectId, kind: 'preview_page_svg', scope: 'page', status: 'ready', runId: 'run-1',
    storageKey: '/workspace/project/svg_output/01.svg', createdAt: now, updatedAt: now,
  };
  const lockedPreviewCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'preview-checkpoint', projectId: project.projectId, stage: 'preview_synced', status: 'completed',
    statusBefore: 'generation_in_progress', statusAfter: 'preview_available', artifactIds: [manifest.artifactId, page.artifactId], createdAt: now,
  };
  return { project, currentRunId: 'run-1', lockedPreviewCheckpoint, manifest, previewArtifacts: [page] };
}

function postProcessedEvidence(): ValidatedPreviewEvidence {
  const baseline = evidence();
  const project = { ...baseline.project, status: 'post_processing' as const };
  const manifest = { ...baseline.manifest, artifactId: 'final-bundle', kind: 'final_bundle' as const };
  const page = { ...baseline.previewArtifacts[0]!, artifactId: 'final-page', kind: 'final_page_svg' as const };
  const lockedPreviewCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'post-processed', projectId: project.projectId, stage: 'post_processed', status: 'completed',
    statusBefore: 'preview_available', statusAfter: 'post_processing', artifactIds: [manifest.artifactId, page.artifactId], createdAt: now,
  };
  return { project, currentRunId: 'run-1', lockedPreviewCheckpoint, manifest, previewArtifacts: [page] };
}

function runtimeThatWrites(stageDir: string, options: { emptyPptx?: boolean } = {}) {
  const pptx = path.join(stageDir, 'deck.pptx');
  const markdown = path.join(stageDir, 'deck.md');
  const imageManifest = path.join(stageDir, 'deck_files', 'image_manifest.json');
  mkdirSync(path.dirname(imageManifest), { recursive: true });
  writeFileSync(pptx, options.emptyPptx ? '' : 'pptx');
  writeFileSync(markdown, 'companion');
  writeFileSync(imageManifest, '{}');
  return { runtimeStatus: 'exported' as const, note: 'test runtime', output: { pptxPath: pptx, markdownCompanionPath: markdown, imageManifestPath: imageManifest } };
}

test('staged export rejects stale or cross-run preview evidence before runtime invocation', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'staged-export-'));
  const preview = evidence();
  preview.previewArtifacts[0]!.runId = 'other-run';
  let calls = 0;
  const result = runStagedExportBridge({
    exportKey: 'export-key', attemptNumber: 1, rootDir, preview,
    invokeRuntime: () => { calls += 1; throw new Error('must not run'); },
  });
  assert.equal(result.kind, 'rejected');
  assert.equal(calls, 0);
  assert.equal(existsSync(toStagingDirectory(rootDir, 'export-key', 1)), false);
});

test('staged export cleans a bridge-error staging directory and emits no durable artifacts', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'staged-export-'));
  const result = runStagedExportBridge({
    exportKey: 'runtime-failure', attemptNumber: 2, rootDir, preview: evidence(),
    invokeRuntime: () => ({ runtimeStatus: 'failed', note: 'bridge boom' }),
  });
  assert.equal(result.kind, 'failed');
  if (result.kind === 'failed') {
    assert.equal(result.failure, 'runtime_error');
    assert.equal(result.cleanup.kind, 'cleaned');
    assert.equal(existsSync(result.stageDir), false);
  }
});

test('staged export accepts only a post-processed final roster', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'staged-export-'));
  try {
    let runtimeCalls = 0;
    const accepted = runStagedExportBridge({
      exportKey: 'post-processed', attemptNumber: 1, rootDir, preview: postProcessedEvidence(),
      invokeRuntime: (_project, stageDir) => { runtimeCalls += 1; return runtimeThatWrites(stageDir); },
    });
    assert.equal(accepted.kind, 'staged');
    assert.equal(runtimeCalls, 1);

    const rejectedEvidence = postProcessedEvidence();
    rejectedEvidence.previewArtifacts[0]!.kind = 'preview_page_svg';
    const rejected = runStagedExportBridge({
      exportKey: 'wrong-final-roster', attemptNumber: 1, rootDir, preview: rejectedEvidence,
      invokeRuntime: () => { throw new Error('must not run'); },
    });
    assert.equal(rejected.kind, 'rejected');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('staged export rejects and cleans an empty PPTX even when companions exist', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'staged-export-'));
  const result = runStagedExportBridge({
    exportKey: 'empty-pptx', attemptNumber: 3, rootDir, preview: evidence(),
    invokeRuntime: (_project, stageDir) => runtimeThatWrites(stageDir, { emptyPptx: true }),
  });
  assert.equal(result.kind, 'failed');
  if (result.kind === 'failed') {
    assert.equal(result.failure, 'invalid_staged_output');
    assert.equal(result.cleanup.kind, 'cleaned');
    assert.equal(existsSync(result.stageDir), false);
  }
});

test('staged export runs the existing shim only into a caller-owned deterministic staging path', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'staged-export-real-'));
  const workspace = path.join(rootDir, 'workspace');
  cpSync('productization/test-fixtures/runtime-workspace', workspace, { recursive: true });
  const preview = evidence();
  preview.project.workspace.workspacePath = workspace;
  const result = runStagedExportBridge({ exportKey: 'real-shim', attemptNumber: 5, rootDir, preview });
  assert.equal(result.kind, 'staged');
  if (result.kind === 'staged') {
    assert.equal(result.stageDir, toStagingDirectory(rootDir, 'real-shim', 5));
    assert.ok(existsSync(result.pptx.path));
    assert.equal(existsSync(path.join(workspace, 'exports')), true, 'the existing shim may retain its legacy workspace export side effect');
  }
  rmSync(rootDir, { recursive: true, force: true });
});

test('staged output is excluded from fresh-read delivery until a later durable commit', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'staged-export-'));
  const result = runStagedExportBridge({
    exportKey: 'success', attemptNumber: 4, rootDir, preview: evidence(),
    invokeRuntime: (_project, stageDir) => runtimeThatWrites(stageDir),
  });
  assert.equal(result.kind, 'staged');
  if (result.kind === 'staged') {
    assert.equal(result.pptx.bytes, 4);
    assert.equal(result.companions.length, 2);
    const stagedArtifact: ProductArtifactRef = {
      artifactId: 'uncommitted-export', projectId: 'staged-export-project', kind: 'export_pptx', scope: 'run', status: 'ready',
      storageKey: result.pptx.path, createdAt: now, updatedAt: now,
    };
    assert.deepEqual(excludeStagedArtifactsFromFreshRead([stagedArtifact]), []);
    assert.equal(existsSync(result.pptx.path), true, 'staging is caller-owned until persistence decides to commit or clean it');
  }
});
