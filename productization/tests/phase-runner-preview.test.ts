import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createCheckpointManager } from '../backend/orchestrator/checkpoint-manager';
import { syncPreviewArtifacts, runStartGeneration } from '../backend/orchestrator/phase-runner';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = 'productization/test-fixtures/runtime-workspace';
  assert.ok(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-phase-runner-preview-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function strategistArtifacts(project: ProjectRecord): ProductArtifactRef[] {
  const createdAt = project.updatedAt;
  const runId = project.lastRunId;
  return [
    {
      artifactId: `${project.projectId}-confirmation-result`, projectId: project.projectId, kind: 'confirmation_result',
      scope: 'project', status: 'ready', runId, storageKey: `${project.workspace.workspacePath}/confirmations/result.json`,
      metadata: { lockedAt: createdAt }, createdAt, updatedAt: createdAt,
    },
    {
      artifactId: `${project.projectId}-design-spec`, projectId: project.projectId, kind: 'design_spec',
      scope: 'project', status: 'ready', runId, storageKey: `${project.workspace.workspacePath}/design_spec.md`,
      metadata: { verification: 'materialized_from_locked_confirmations' }, createdAt, updatedAt: createdAt,
    },
    {
      artifactId: `${project.projectId}-spec-lock`, projectId: project.projectId, kind: 'spec_lock',
      scope: 'project', status: 'locked', runId, storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
      metadata: { verification: 'materialized_from_locked_confirmations' }, createdAt, updatedAt: createdAt,
    },
  ];
}

function main() {
  const fixture = makeWorkspaceFixture();
  try {
    const project: ProjectRecord = {
      projectId: 'pptmaster-demo-project',
      name: 'PPTMASTER Demo Project',
      status: 'spec_ready',
      workspace: {
        projectId: 'pptmaster-demo-project',
        workspacePath: fixture.workspacePath,
      },
      lastRunId: 'pptmaster-demo-project-strategist-1',
      createdAt: '2026-06-30T16:00:00.000Z',
      updatedAt: '2026-06-30T16:15:00.000Z',
    };

    const manager = createCheckpointManager();
    const startedMarker = manager.start({
      projectId: project.projectId,
      stage: 'generation_started',
      statusBefore: project.status,
      createdAt: '2026-06-30T16:20:00.000Z',
    });
    assert.equal(startedMarker.status, 'started', 'checkpoint manager should create started marker');

    const started = runStartGeneration(project, strategistArtifacts(project), '2026-06-30T16:20:00.000Z');
    assert.equal(started.project.status, 'generation_in_progress', 'start generation should move to generation_in_progress');
    assert.ok(started.runId, 'start generation should create a run id');

    const previewed = syncPreviewArtifacts(started.project, '2026-06-30T16:25:00.000Z');
    assert.equal(previewed.project.status, 'preview_available', 'preview sync should move to preview_available');
    assert.equal(previewed.nextStatus, 'preview_available', 'preview sync should expose nextStatus for orchestration consumers');
    assert.ok(previewed.artifacts.some((item) => item.kind === 'preview_bundle'), 'preview sync should create preview bundle');
    assert.ok(previewed.artifacts.some((item) => item.kind === 'preview_page_svg'), 'preview sync should create preview svg');
    assert.ok(previewed.artifacts.some((item) => item.metadata?.verification === 'runtime_workspace_generation_bridge' && item.metadata?.role === 'generation_evidence'), 'preview sync should return normalization generation evidence');

    const completedMarker = manager.complete({
      projectId: project.projectId,
      stage: 'preview_synced',
      statusBefore: 'generation_in_progress',
      statusAfter: 'preview_available',
      artifactIds: previewed.artifacts.map((item) => item.artifactId),
      createdAt: '2026-06-30T16:25:00.000Z',
    });
    assert.equal(completedMarker.status, 'completed', 'checkpoint manager should create completed marker');

    console.log('phase-runner preview test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
