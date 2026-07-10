import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { createProjectWorkbenchNodeServer } from '../app/project-workbench-node-server.ts';

function dependencies(project: ProjectRecord, artifacts: ProductArtifactRef[] = [], checkpoints: WorkflowCheckpoint[] = []) {
  return {
    projects: {
      async getById(projectId: string): Promise<ProjectRecord | null> {
        return projectId === project.projectId ? project : null;
      },
      async update(updatedProject: ProjectRecord): Promise<ProjectRecord> {
        project = updatedProject;
        return updatedProject;
      },
    },
    artifacts: {
      async listByProjectId(): Promise<ProductArtifactRef[]> {
        return artifacts;
      },
      async createMany(newArtifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]> {
        artifacts = [...artifacts, ...newArtifacts];
        return newArtifacts;
      },
    },
    checkpoints: {
      async getLatestByProjectId(): Promise<WorkflowCheckpoint | null> {
        return checkpoints.at(-1) ?? null;
      },
      async listByProjectId(): Promise<WorkflowCheckpoint[]> {
        return checkpoints;
      },
      async create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint> {
        checkpoints = [...checkpoints, checkpoint];
        return checkpoint;
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
    assert.equal(malformedSubmit.status, 400, 'the network adapter should forward POST bodies to the workbench action route');
    assert.match(await malformedSubmit.text(), /Malformed request body/i);

    const oversizedSubmit = await fetch(`${origin}/projects/node%20route%20proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(1_000_001),
    });
    assert.equal(oversizedSubmit.status, 413, 'the network adapter should reject oversized POST bodies before route parsing');
    assert.match(await oversizedSubmit.text(), /Request body too large/i);

    const startGenerationPayload = JSON.stringify({ action: 'start_generation' });
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-workbench-node-generation-'));
    const generationWorkspace = path.join(workspaceRoot, 'runtime-workspace');
    cpSync(path.resolve('productization/test-fixtures/runtime-workspace'), generationWorkspace, { recursive: true });
    try {
      const generationProject: ProjectRecord = {
        ...project,
        status: 'spec_ready',
        workspace: {
          projectId: project.projectId,
          workspacePath: generationWorkspace,
        },
        lastRunId: 'node-route-proof-run',
        latestCheckpointId: 'node-route-proof-spec-ready',
      };
    const generationArtifacts: ProductArtifactRef[] = [
      {
        artifactId: 'node-route-proof-design-spec',
        projectId: generationProject.projectId,
        kind: 'design_spec',
        scope: 'project',
        status: 'ready',
        label: 'Design spec',
        storageKey: 'projects/node-route-proof/design_spec.md',
        mimeType: 'text/markdown',
        metadata: { verification: 'verified_runtime_bridge' },
        createdAt: '2026-07-10T12:05:00.000Z',
        updatedAt: '2026-07-10T12:05:00.000Z',
      },
      {
        artifactId: 'node-route-proof-spec-lock',
        projectId: generationProject.projectId,
        kind: 'spec_lock',
        scope: 'project',
        status: 'ready',
        label: 'Spec lock',
        storageKey: 'projects/node-route-proof/spec_lock.md',
        mimeType: 'text/markdown',
        metadata: { verification: 'verified_runtime_bridge' },
        createdAt: '2026-07-10T12:05:00.000Z',
        updatedAt: '2026-07-10T12:05:00.000Z',
      },
    ];
    server.close();
    await once(server, 'close');

    const generationServer = createProjectWorkbenchNodeServer(dependencies(generationProject, generationArtifacts));
    generationServer.listen(0, '127.0.0.1');
    await once(generationServer, 'listening');
    const generationAddress = generationServer.address();
    assert.ok(generationAddress && typeof generationAddress !== 'string');
    const generationOrigin = `http://127.0.0.1:${generationAddress.port}`;

    try {
      const startGeneration = await fetch(`${generationOrigin}/projects/node%20route%20proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: startGenerationPayload,
      });
      assert.equal(startGeneration.status, 200, 'the network adapter should expose start_generation when the workbench action is valid');
      assert.equal(startGeneration.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.match(await startGeneration.text(), /Generation in progress|Preview assets|preview page/i);

      const unknownProject = await fetch(`${generationOrigin}/projects/unknown-project`);
      assert.equal(unknownProject.status, 404, 'the HTTP boundary should preserve missing project behavior');

      const routeMiss = await fetch(`${generationOrigin}/healthz`);
      assert.equal(routeMiss.status, 404, 'unowned paths should not be claimed by the workbench server');
    } finally {
      generationServer.close();
      await once(generationServer, 'close');
    }
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  } finally {
    if (server.listening) {
      server.close();
      await once(server, 'close');
    }
  }

  console.log('project workbench node server test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
