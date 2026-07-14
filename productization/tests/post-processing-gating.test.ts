import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runPostProcessingPhase } from '../backend/orchestrator/phase-runner';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects';

const now = '2026-07-13T09:00:00.000Z';

function fixture(): { project: ProjectRecord; artifacts: ProductArtifactRef[]; checkpoints: WorkflowCheckpoint[]; cleanup(): void } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-post-process-gate-'));
  const workspace = path.join(root, 'workspace');
  cpSync('productization/test-fixtures/runtime-workspace', workspace, { recursive: true });
  const project: ProjectRecord = {
    projectId: 'post-process-project', name: 'Post-processing project', status: 'preview_available',
    workspace: { projectId: 'post-process-project', workspacePath: workspace }, lastRunId: 'run-1', createdAt: now, updatedAt: now,
  };
  const pages = readdirSync(path.join(workspace, 'svg_output')).filter((name) => name.endsWith('.svg')).sort().slice(0, 2).map((filename, index) => {
    const storageKey = path.join(workspace, 'svg_output', filename);
    return {
      artifactId: `page-${index + 1}`, projectId: project.projectId, kind: 'preview_page_svg' as const, scope: 'page' as const,
      status: 'ready' as const, pageKey: `page-${index + 1}`, runId: 'run-1', storageKey, createdAt: now, updatedAt: now,
      metadata: { generationProvenance: { filename, storageKey, sha256: createHash('sha256').update(readFileSync(storageKey)).digest('hex') } },
    };
  });
  const bundle: ProductArtifactRef = {
    artifactId: 'bundle', projectId: project.projectId, kind: 'preview_bundle', scope: 'run', status: 'ready', runId: 'run-1',
    storageKey: path.join(workspace, 'preview', 'index.json'), createdAt: now, updatedAt: now,
  };
  const report: ProductArtifactRef = {
    artifactId: 'quality-report', projectId: project.projectId, kind: 'quality_report', scope: 'run', status: 'ready', runId: 'run-1',
    storageKey: path.join(workspace, 'quality', 'quality-report.json'), createdAt: now, updatedAt: now,
    metadata: { sourcePreviewCheckpointId: 'preview-checkpoint', sha256: 'a'.repeat(64), summary: { passed: true } },
  };
  const preview: WorkflowCheckpoint = {
    checkpointId: 'preview-checkpoint', projectId: project.projectId, stage: 'preview_synced', status: 'completed',
    statusBefore: 'generation_in_progress', statusAfter: 'preview_available', artifactIds: [bundle.artifactId, ...pages.map((page) => page.artifactId)], createdAt: now,
  };
  const quality: WorkflowCheckpoint = {
    checkpointId: 'quality-checkpoint', projectId: project.projectId, stage: 'quality_checked', status: 'completed',
    statusBefore: 'preview_available', statusAfter: 'preview_available', artifactIds: [report.artifactId], createdAt: now,
  };
  return { project, artifacts: [bundle, ...pages, report], checkpoints: [preview, quality], cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('post-processing fails closed without an unambiguous passed Quality Check', () => {
  const state = fixture();
  try {
    state.artifacts = state.artifacts.filter((artifact) => artifact.kind !== 'quality_report');
    let calls = 0;
    const result = runPostProcessingPhase(state.project, state.artifacts, state.checkpoints, now, { run: () => { calls += 1; return { errors: 0, warnings: 0 }; } });
    assert.equal(calls, 0);
    assert.equal(result.project.status, 'preview_available');
    assert.equal(result.checkpoints[0]?.status, 'failed');
    assert.equal(result.artifacts.some((artifact) => artifact.kind === 'final_page_svg' && artifact.status === 'ready'), false);
  } finally { state.cleanup(); }
});

test('post-processing materializes a hash-verified exact final roster without claiming export readiness', () => {
  const state = fixture();
  try {
    const result = runPostProcessingPhase(state.project, state.artifacts, state.checkpoints, now, {
      run: (input) => {
        const finalDir = path.join(input.project.workspace.workspacePath, 'svg_final');
        mkdirSync(finalDir, { recursive: true });
        for (const page of input.pages) cpSync(page.storageKey, path.join(finalDir, path.basename(page.storageKey)));
        return { errors: 0, warnings: 1, note: 'fixture finalizer passed' };
      },
    });
    assert.equal(result.project.status, 'post_processing');
    assert.equal(result.checkpoints[0]?.stage, 'post_processed');
    assert.equal(result.checkpoints[0]?.status, 'completed');
    const finalPages = result.artifacts.filter((artifact) => artifact.kind === 'final_page_svg');
    assert.equal(finalPages.length, 2);
    assert.equal(finalPages.every((artifact) => artifact.status === 'ready' && existsSync(artifact.storageKey) && typeof artifact.metadata?.sha256 === 'string'), true);
    assert.equal(result.artifacts.some((artifact) => artifact.kind === 'final_bundle' && artifact.status === 'ready'), true);
    assert.equal(result.artifacts.some((artifact) => artifact.kind === 'post_processing_report' && artifact.status === 'ready'), true);
    assert.equal(result.artifacts.some((artifact) => artifact.kind === 'export_pptx'), false);
  } finally { state.cleanup(); }
});
