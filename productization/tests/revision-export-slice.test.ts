import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { exportLocalPhase, requestRevision, runResumeGeneration, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord } from '../backend/models/projects.ts';
import { toProjectViewModel } from '../backend/services/project-view-service.ts';
import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = 'productization/test-fixtures/runtime-workspace';
  assert.ok(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-revision-export-slice-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  const fixture = makeWorkspaceFixture();
  try {
    const baseProject: ProjectRecord = {
      projectId: 'pptmaster-demo-project',
      name: 'PPTMASTER Demo Project',
      status: 'generation_in_progress',
      workspace: {
        projectId: 'pptmaster-demo-project',
        workspacePath: fixture.workspacePath,
      },
      lastRunId: 'pptmaster-demo-project-run-1751300700000',
      createdAt: '2026-06-30T16:00:00.000Z',
      updatedAt: '2026-06-30T16:20:00.000Z',
    };

    const previewed = syncPreviewArtifacts(baseProject, '2026-06-30T16:25:00.000Z');
    assert.equal(previewed.project.status, 'preview_available', 'preview sync should move to preview_available');

    const revised = requestRevision(previewed.project, 'Tighten page 1 headline', '2026-06-30T16:30:00.000Z');
    assert.equal(revised.project.status, 'revision_requested', 'revision request should move to revision_requested');
    assert.equal(revised.nextStatus, 'revision_requested', 'revision request should expose nextStatus for orchestration consumers');
    assert.equal(revised.checkpoints[0]?.stage, 'revision_requested', 'revision request should create checkpoint');
    assert.equal(revised.checkpoints[0]?.status, 'completed', 'revision checkpoint should be recorded as completed');

    const revisionArtifact = revised.artifacts.find((item) => item.kind === 'runtime_log');
    assert.ok(revisionArtifact, 'revision request should create a durable revision artifact record');
    assert.equal(revisionArtifact?.metadata?.note, 'Tighten page 1 headline', 'revision artifact should preserve the revision note');

    const resumed = runResumeGeneration(revised.project, '2026-06-30T16:35:00.000Z');
    assert.equal(resumed.project.status, 'generation_in_progress', 'resume should move back to generation_in_progress');

    const resumedPreview = syncPreviewArtifacts(resumed.project, '2026-06-30T16:37:00.000Z');
    assert.throws(
      () => exportLocalPhase(resumedPreview.project, '2026-06-30T16:40:00.000Z'),
      /local export is not a delivery path/,
      'local export must fail closed instead of bypassing verified staged delivery',
    );

    const previewArtifacts: ProductArtifactRef[] = [...previewed.artifacts];
    const revisionArtifacts: ProductArtifactRef[] = [...previewed.artifacts, ...revised.artifacts];
    const previewView = toProjectViewModel(previewed.project, previewArtifacts, [], previewed.checkpoints[0]);
    assert.deepEqual(previewView.nextActions, ['run_quality_check'], 'preview_available should require Quality Check before export');

    const revisionView = toProjectViewModel(revised.project, revisionArtifacts, [], revised.checkpoints[0]);
    assert.equal(revisionView.latestCheckpoint?.stage, 'revision_requested', 'revision view should surface latest checkpoint stage');
    assert.equal(revisionView.latestCheckpoint?.status, 'completed', 'revision view should surface latest checkpoint status');
    assert.equal(revisionView.lastUpdatedAt, revised.project.updatedAt, 'revision view should surface revision updatedAt');
    assert.ok((revisionView.latestCheckpoint?.storageKey ?? '').endsWith('.json'), 'revision view should surface a checkpoint storage key');
    assert.equal(revisionView.latestRevisionRequest?.note, 'Tighten page 1 headline', 'revision view should expose latest revision note');
    assert.deepEqual(revisionView.nextActions, ['resume_generation'], 'revision_requested should surface resume_generation as the next action');
    assert.ok(revisionView.workbench.sections.some((item) => item.key === 'recovery'), 'revision_requested should project a dedicated recovery section');
    const revisionHtml = renderProjectWorkbenchShell(revisionView);
    assert.match(revisionHtml, /data-panel="recovery"/);
    assert.match(revisionHtml, /Tighten page 1 headline/);
    assert.match(revisionHtml, /resume_generation/);

    console.log('revision export slice test: ok');

    console.log('revision/export slice test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
