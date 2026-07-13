import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';
import { createVerifiedExportWorkbenchDependencies } from '../app/project-workbench-verified-export-composition.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { InMemoryExportPersistenceStateRepository } from '../backend/state/export-persistence-unit-of-work.ts';

const NOW = '2026-07-13T12:00:00.000Z';
const PROJECT_ID = 'workbench-quality-check-project';
const RUN_ID = 'workbench-quality-check-run';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-workbench-quality-check-'));
  const workspace = path.join(root, 'workspace');
  cpSync('productization/test-fixtures/runtime-workspace', workspace, { recursive: true });
  const project: ProjectRecord = {
    projectId: PROJECT_ID,
    name: 'Workbench quality check proof',
    status: 'preview_available',
    workspace: { projectId: PROJECT_ID, workspacePath: workspace },
    lastRunId: RUN_ID,
    latestCheckpointId: 'preview-locked',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const pages: ProductArtifactRef[] = readdirSync(path.join(workspace, 'svg_output'))
    .filter((filename) => filename.endsWith('.svg'))
    .sort()
    .slice(0, 2)
    .map((filename, index) => {
      const storageKey = path.join(workspace, 'svg_output', filename);
      return {
        artifactId: `preview-page-${index + 1}`,
        projectId: PROJECT_ID,
        kind: 'preview_page_svg',
        scope: 'page',
        status: 'ready',
        pageKey: `page-${index + 1}`,
        runId: RUN_ID,
        storageKey,
        metadata: {
          generationProvenance: {
            filename,
            storageKey,
            sha256: createHash('sha256').update(readFileSync(storageKey)).digest('hex'),
          },
        },
        createdAt: NOW,
        updatedAt: NOW,
      };
    });
  const bundle: ProductArtifactRef = {
    artifactId: 'preview-bundle',
    projectId: PROJECT_ID,
    kind: 'preview_bundle',
    scope: 'run',
    status: 'ready',
    runId: RUN_ID,
    storageKey: path.join(workspace, 'preview', 'index.json'),
    createdAt: NOW,
    updatedAt: NOW,
  };
  const checkpoint: WorkflowCheckpoint = {
    checkpointId: 'preview-locked',
    projectId: PROJECT_ID,
    stage: 'preview_synced',
    status: 'completed',
    statusBefore: 'generation_in_progress',
    statusAfter: 'preview_available',
    artifactIds: [bundle.artifactId, ...pages.map((page) => page.artifactId)],
    createdAt: NOW,
  };
  return {
    root,
    project,
    artifacts: [bundle, ...pages],
    checkpoints: [checkpoint],
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}

async function main() {
  const passing = fixture();
  try {
    let runnerCalls = 0;
    const state = new InMemoryExportPersistenceStateRepository({
      projects: [passing.project], artifacts: passing.artifacts, checkpoints: passing.checkpoints,
    });
    const dependencies = createVerifiedExportWorkbenchDependencies(state, {
      rootDir: passing.root,
      now: () => NOW,
      qualityCheckRunner(input) {
        runnerCalls += 1;
        return { errors: 0, warnings: 1, scannedFiles: input.pages.map((page) => page.storageKey) };
      },
    });

    const response = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'POST',
      url: `/projects/${PROJECT_ID}`,
      body: JSON.stringify({ action: 'run_quality_check' }),
    });

    assert.equal(response.status, 200, response.body);
    assert.equal(runnerCalls, 1, 'preview-only Quality Check POST must invoke the server-owned runner');
    const persisted = state.snapshot();
    const report = persisted.artifacts.find((artifact) => artifact.kind === 'quality_report');
    const checkpoint = persisted.checkpoints.find((item) => item.stage === 'quality_checked');
    assert.equal(report?.status, 'ready');
    assert.equal(report?.runId, RUN_ID);
    assert.equal(checkpoint?.status, 'completed');
    assert.equal(checkpoint?.artifactIds[0], report?.artifactId);
    assert.match(response.body, /quality_report/);
  } finally {
    passing.cleanup();
  }

  const failing = fixture();
  try {
    let exportCalls = 0;
    const state = new InMemoryExportPersistenceStateRepository({
      projects: [failing.project], artifacts: failing.artifacts, checkpoints: failing.checkpoints,
    });
    const dependencies = createVerifiedExportWorkbenchDependencies(state, {
      rootDir: failing.root,
      now: () => NOW,
      qualityCheckRunner(input) {
        return { errors: 1, warnings: 0, scannedFiles: input.pages.map((page) => page.storageKey) };
      },
    });
    const qualityResponse = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'POST',
      url: `/projects/${PROJECT_ID}`,
      body: JSON.stringify({ action: 'run_quality_check' }),
    });
    assert.equal(qualityResponse.status, 200, qualityResponse.body);
    assert.equal(state.snapshot().artifacts.find((artifact) => artifact.kind === 'quality_report')?.status, 'failed');
    assert.equal(state.snapshot().checkpoints.find((item) => item.stage === 'quality_checked')?.status, 'failed');

    const exportResponse = await handleProjectWorkbenchHttpRequest({
      ...dependencies,
      async exportPptx() {
        exportCalls += 1;
        return { kind: 'delivered' as const, primaryArtifactId: 'should-not-export' };
      },
    }, {
      method: 'POST',
      url: `/projects/${PROJECT_ID}`,
      body: JSON.stringify({ action: 'export_pptx', idempotencyKey: 'failed-quality-must-not-export' }),
    });
    assert.equal(exportResponse.status, 400);
    assert.equal(exportCalls, 0, 'a failed Quality Check must not reach export');
    assert.match(exportResponse.body, /Quality Check/i);
  } finally {
    failing.cleanup();
  }

  console.log('project workbench Quality Check HTTP test: ok');
}

void main();
