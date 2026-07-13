import assert from 'node:assert/strict';

import { hasVerifiedQualityCheck } from '../backend/adapter/quality-check-runtime-bridge.ts';
import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';

const NOW = '2026-07-11T12:00:00.000Z';
const PROJECT_ID = 'verified-export-http-project';
const RUN_ID = 'verified-export-run-1';

function artifact(artifactId: string, kind: ProductArtifactRef['kind']): ProductArtifactRef {
  return {
    artifactId,
    projectId: PROJECT_ID,
    kind,
    scope: 'run',
    status: 'ready',
    runId: RUN_ID,
    storageKey: `projects/${PROJECT_ID}/${artifactId}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function main() {
  let project: ProjectRecord = {
    projectId: PROJECT_ID,
    name: 'Verified export HTTP proof',
    status: 'preview_available',
    workspace: { projectId: PROJECT_ID, workspacePath: '/tmp/verified-export-http-project' },
    lastRunId: RUN_ID,
    latestCheckpointId: 'preview-locked',
    createdAt: NOW,
    updatedAt: NOW,
  };
  let artifacts = [artifact('preview-bundle', 'preview_bundle'), artifact('preview-page-1', 'preview_page_svg')];
  let checkpoints: WorkflowCheckpoint[] = [{
    checkpointId: 'preview-locked',
    projectId: PROJECT_ID,
    stage: 'preview_synced',
    status: 'completed',
    statusBefore: 'generation_in_progress',
    statusAfter: 'preview_available',
    artifactIds: artifacts.map((item) => item.artifactId),
    createdAt: NOW,
  }];
  let invocations = 0;

  const dependencies = {
    projects: {
      async getById(projectId: string) { return projectId === PROJECT_ID ? project : null; },
    },
    artifacts: {
      async listByProjectId() { return artifacts; },
    },
    checkpoints: {
      async getLatestByProjectId() { return checkpoints.at(-1) ?? null; },
      async listByProjectId() { return checkpoints; },
    },
    async exportPptx(input: { project: ProjectRecord; artifacts: ProductArtifactRef[]; checkpoints: WorkflowCheckpoint[] }) {
      invocations += 1;
      assert.equal(input.project.status, 'preview_available');
      assert.equal(input.project.lastRunId, RUN_ID);
      assert.equal(input.checkpoints.some((checkpoint) => checkpoint.stage === 'preview_synced'), true);
      assert.equal(input.checkpoints.some((checkpoint) => checkpoint.stage === 'quality_checked' && checkpoint.status === 'completed'), true);
      assert.deepEqual(input.artifacts.map((item) => item.kind).sort(), ['preview_bundle', 'preview_page_svg', 'quality_report']);

      const pptx = artifact('committed-pptx', 'export_pptx');
      project = { ...project, status: 'export_ready', latestCheckpointId: 'export-committed', updatedAt: NOW };
      artifacts = [...artifacts, pptx];
      checkpoints = [...checkpoints, {
        checkpointId: 'export-committed', projectId: PROJECT_ID, stage: 'export_ready', status: 'completed',
        statusBefore: 'preview_available', statusAfter: 'export_ready', artifactIds: [pptx.artifactId], createdAt: NOW,
      }];
      return { kind: 'delivered' as const, primaryArtifactId: pptx.artifactId };
    },
  };

  assert.equal(hasVerifiedQualityCheck(project, artifacts, checkpoints), false, 'fixture must begin without a passed Quality Check');
  const uncheckedResponse = await handleProjectWorkbenchHttpRequest(dependencies, {
    method: 'POST',
    url: `/projects/${PROJECT_ID}`,
    body: JSON.stringify({ action: 'export_pptx', idempotencyKey: 'unchecked-preview-must-not-export' }),
  });

  assert.equal(uncheckedResponse.status, 400, 'an unchecked preview must not reach the verified export runtime');
  assert.equal(invocations, 0, 'an unchecked preview must fail before export invocation');
  assert.match(uncheckedResponse.body, /Quality Check/i);

  const qualityReport = artifact('quality-report', 'quality_report');
  qualityReport.metadata = {
    sourcePreviewCheckpointId: 'preview-locked',
    summary: { passed: true },
    sha256: 'a'.repeat(64),
  };
  artifacts = [...artifacts, qualityReport];
  checkpoints = [...checkpoints, {
    checkpointId: 'quality-checked', projectId: PROJECT_ID, stage: 'quality_checked', status: 'completed',
    statusBefore: 'preview_available', statusAfter: 'preview_available', artifactIds: [qualityReport.artifactId], createdAt: NOW,
  }];

  assert.equal(hasVerifiedQualityCheck(project, artifacts, checkpoints), true, 'fixture must become quality-verified before export');

  const response = await handleProjectWorkbenchHttpRequest(dependencies, {
    method: 'POST',
    url: `/projects/${PROJECT_ID}`,
    body: JSON.stringify({ action: 'export_pptx', idempotencyKey: 'verified-export-http-proof' }),
  });

  assert.equal(response.status, 200, response.body);
  assert.equal(invocations, 1, 'a checked preview must invoke the verified export runtime exactly once');
  assert.match(response.body, /export_ready/);
  assert.match(response.body, /Committed PPTX export|committed-pptx/);
  console.log('project workbench verified export HTTP test: ok');
}

void main();
