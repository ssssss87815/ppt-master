import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runQualityCheckPhase } from '../backend/orchestrator/phase-runner';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects';

const now = '2026-07-13T08:00:00.000Z';

function fixture(): { project: ProjectRecord; artifacts: ProductArtifactRef[]; checkpoints: WorkflowCheckpoint[]; cleanup(): void } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-quality-gate-'));
  const workspace = path.join(root, 'workspace');
  cpSync('productization/test-fixtures/runtime-workspace', workspace, { recursive: true });
  const project: ProjectRecord = {
    projectId: 'quality-project', name: 'Quality project', status: 'preview_available',
    workspace: { projectId: 'quality-project', workspacePath: workspace }, lastRunId: 'run-1', createdAt: now, updatedAt: now,
  };
  const filenames = readdirSync(path.join(workspace, 'svg_output')).filter((name) => name.endsWith('.svg')).sort().slice(0, 2);
  const pages = filenames.map((filename, index) => {
    const file = path.join(workspace, 'svg_output', filename);
    return {
      artifactId: `page-${index + 1}`, projectId: project.projectId, kind: 'preview_page_svg' as const,
      scope: 'page' as const, status: 'ready' as const, pageKey: `page-${index + 1}`, runId: 'run-1',
      storageKey: file, createdAt: now, updatedAt: now,
      metadata: { generationProvenance: { filename, storageKey: file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') } },
    };
  });
  const manifest = {
    artifactId: 'bundle', projectId: project.projectId, kind: 'preview_bundle' as const, scope: 'run' as const,
    status: 'ready' as const, runId: 'run-1', storageKey: path.join(workspace, 'preview', 'index.json'), createdAt: now, updatedAt: now,
  };
  const checkpoint: WorkflowCheckpoint = {
    checkpointId: 'preview-checkpoint', projectId: project.projectId, stage: 'preview_synced', status: 'completed',
    statusBefore: 'generation_in_progress', statusAfter: 'preview_available', artifactIds: [manifest.artifactId, ...pages.map((page) => page.artifactId)], createdAt: now,
  };
  return { project, artifacts: [manifest, ...pages], checkpoints: [checkpoint], cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('quality check fails closed before checker invocation when preview evidence is stale', () => {
  const state = fixture();
  try {
    state.artifacts.find((artifact) => artifact.kind === 'preview_page_svg')!.runId = 'stale-run';
    let calls = 0;
    const result = runQualityCheckPhase(state.project, state.artifacts, state.checkpoints, now, {
      run: () => { calls += 1; return { errors: 0, warnings: 0, scannedFiles: [] }; },
    });
    assert.equal(calls, 0);
    assert.equal(result.checkpoints[0]!.status, 'failed');
    assert.equal(result.artifacts.some((artifact) => artifact.kind === 'quality_report' && artifact.status === 'ready'), false);
    assert.match(result.project.lastError ?? '', /stale|cross-run/i);
  } finally { state.cleanup(); }
});

test('quality check persists a failed report and never passes when checker reports errors', () => {
  const state = fixture();
  try {
    const result = runQualityCheckPhase(state.project, state.artifacts, state.checkpoints, now, {
      run: (input) => ({ errors: 1, warnings: 0, scannedFiles: input.pages.map((page) => page.storageKey) }),
    });
    assert.equal(result.project.status, 'preview_available');
    assert.equal(result.checkpoints[0]!.status, 'failed');
    assert.equal(result.artifacts[0]?.kind, 'quality_report');
    assert.equal(result.artifacts[0]?.status, 'failed');
    assert.equal(result.artifacts.some((artifact) => artifact.status === 'ready'), false);
  } finally { state.cleanup(); }
});

test('quality check persists a ready report and keeps preview_available only after a verified same-run pass', () => {
  const state = fixture();
  try {
    const result = runQualityCheckPhase(state.project, state.artifacts, state.checkpoints, now, {
      run: (input) => ({ errors: 0, warnings: 1, scannedFiles: input.pages.map((page) => page.storageKey) }),
    });
    assert.equal(result.project.status, 'preview_available');
    assert.equal(result.checkpoints[0]!.stage, 'quality_checked');
    assert.equal(result.checkpoints[0]!.status, 'completed');
    const report = result.artifacts.find((artifact) => artifact.kind === 'quality_report');
    assert.equal(report?.status, 'ready');
    assert.equal(report?.runId, state.project.lastRunId);
    assert.equal(typeof report?.metadata?.sha256, 'string');
    assert.equal(existsSync(report!.storageKey), true);
  } finally { state.cleanup(); }
});
