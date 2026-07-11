import assert from 'node:assert/strict';

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
      assert.equal(input.checkpoints.at(-1)?.stage, 'preview_synced');
      assert.deepEqual(input.artifacts.map((item) => item.kind).sort(), ['preview_bundle', 'preview_page_svg']);

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

  const response = await handleProjectWorkbenchHttpRequest(dependencies, {
    method: 'POST',
    url: `/projects/${PROJECT_ID}`,
    body: JSON.stringify({ action: 'export_pptx', idempotencyKey: 'verified-export-http-proof' }),
  });

  assert.equal(response.status, 200);
  assert.equal(invocations, 1, 'the workbench route must invoke the verified export runtime exactly once');
  assert.match(response.body, /export_ready/);
  assert.match(response.body, /Committed PPTX export|committed-pptx/);
  console.log('project workbench verified export HTTP test: ok');
}

void main();
