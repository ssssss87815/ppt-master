import assert from 'node:assert/strict';
import { once } from 'node:events';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { createProjectWorkbenchNodeServer } from '../app/project-workbench-node-server.ts';

function dependencies(project: ProjectRecord) {
  return {
    projects: {
      async getById(projectId: string): Promise<ProjectRecord | null> {
        return projectId === project.projectId ? project : null;
      },
    },
    artifacts: {
      async listByProjectId(): Promise<ProductArtifactRef[]> {
        return [];
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
    projectId: 'node route proof',
    name: 'Node route proof',
    status: 'draft',
    workspace: {
      projectId: 'node route proof',
      workspacePath: 'projects/node-route-proof',
    },
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
  };
  const server = createProjectWorkbenchNodeServer(dependencies(project));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'server should bind an ephemeral TCP port');
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const success = await fetch(`${origin}/projects/node%20route%20proof?source=browser`);
    assert.equal(success.status, 200, 'the network adapter should expose the page-level workbench over HTTP');
    assert.equal(success.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await success.text(), /<title>Node route proof — workbench<\/title>/);

    const methodMiss = await fetch(`${origin}/projects/node%20route%20proof`, { method: 'DELETE' });
    assert.equal(methodMiss.status, 405, 'unsupported methods should preserve route-level method handling');
    assert.equal(methodMiss.headers.get('allow'), 'GET, POST');

    const malformedSubmit = await fetch(`${origin}/projects/node%20route%20proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    assert.equal(malformedSubmit.status, 400, 'the network adapter should forward POST bodies to the confirmation route');
    assert.match(await malformedSubmit.text(), /Malformed request body/i);

    const unknownProject = await fetch(`${origin}/projects/unknown-project`);
    assert.equal(unknownProject.status, 404, 'the HTTP boundary should preserve missing project behavior');

    const routeMiss = await fetch(`${origin}/healthz`);
    assert.equal(routeMiss.status, 404, 'unowned paths should not be claimed by the workbench server');
  } finally {
    server.close();
    await once(server, 'close');
  }

  console.log('project workbench node server test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
