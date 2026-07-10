import assert from 'node:assert/strict';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';

function dependencies(project: ProjectRecord) {
  return {
    projects: {
      async getById(projectId: string): Promise<ProjectRecord | null> {
        return projectId === project.projectId ? project : null;
      },
    },
    artifacts: {
      async listByProjectId(projectId: string): Promise<ProductArtifactRef[]> {
        return projectId === project.projectId ? [] : [];
      },
    },
    checkpoints: {
      async getLatestByProjectId(): Promise<WorkflowCheckpoint | null> {
        return null;
      },
      async listByProjectId(): Promise<WorkflowCheckpoint[]> {
        return [];
      },
    },
  };
}

async function main() {
  const project: ProjectRecord = {
    projectId: 'pitch deck / 2026',
    name: 'Pitch deck route proof',
    status: 'draft',
    workspace: {
      projectId: 'pitch deck / 2026',
      workspacePath: 'projects/pitch-deck-route-proof',
    },
    createdAt: '2026-07-10T10:10:00.000Z',
    updatedAt: '2026-07-10T10:10:00.000Z',
  };

  const success = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'GET',
    url: '/projects/pitch%20deck%20%2F%202026?from=workbench',
  });

  assert.equal(success.status, 200, 'GET project routes should render the page-level workbench');
  assert.deepEqual(success.headers, { 'content-type': 'text/html; charset=utf-8' });
  assert.match(success.body, /<title>Pitch deck route proof — workbench<\/title>/);
  assert.match(success.body, /<title>Pitch deck route proof — workbench<\/title>/, 'the decoded project id should select the repository project before page rendering');

  const missing = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'GET',
    url: '/projects/missing-project',
  });
  assert.equal(missing.status, 404, 'known workbench routes should preserve the page boundary not-found result');
  assert.match(missing.body, /Project workbench unavailable/);

  const routeMiss = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'GET',
    url: '/healthz',
  });
  assert.equal(routeMiss.status, 404, 'unowned routes must not be represented as project page failures');
  assert.equal(routeMiss.body, 'Not found');

  const methodMiss = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'POST',
    url: '/projects/pitch%20deck%20%2F%202026',
  });
  assert.equal(methodMiss.status, 400, 'POST without body should return 400 for submit_confirmations');
  assert.match(methodMiss.body, /Malformed request body/i, 'POST without body should report body error');

  const deleteMethod = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'DELETE',
    url: '/projects/pitch%20deck%20%2F%202026',
  });
  assert.equal(deleteMethod.status, 405, 'unsupported methods should still return 405');
  assert.match(deleteMethod.headers.allow ?? '', /POST/i, '405 response should advertise POST as allowed');

  const malformed = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'GET',
    url: '/projects/%E0%A4%A',
  });
  assert.equal(malformed.status, 400, 'malformed route encoding should fail before repository access');
  assert.equal(malformed.body, 'Invalid project id');

  console.log('project workbench http route test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
