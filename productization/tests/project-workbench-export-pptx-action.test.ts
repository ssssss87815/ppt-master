import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = path.resolve('productization/test-fixtures/runtime-workspace');
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-workbench-export-action-'));
  const workspacePath = path.join(root, 'runtime-workspace');
  cpSync(source, workspacePath, { recursive: true });

  return {
    workspacePath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

async function main() {
  const fixture = makeWorkspaceFixture();
  try {
    let project: ProjectRecord = {
      projectId: 'persistent-export-action',
      name: 'Persistent export action',
      status: 'preview_available',
      workspace: {
        projectId: 'persistent-export-action',
        workspacePath: fixture.workspacePath,
      },
      lastRunId: 'persistent-export-action-run',
      createdAt: '2026-07-11T12:00:00.000Z',
      updatedAt: '2026-07-11T12:00:00.000Z',
    };
    let artifacts: ProductArtifactRef[] = [
      {
        artifactId: 'persistent-export-preview-bundle',
        projectId: project.projectId,
        kind: 'preview_bundle',
        scope: 'run',
        status: 'ready',
        runId: project.lastRunId,
        storageKey: 'projects/persistent-export-action/preview/index.json',
        createdAt: '2026-07-11T12:00:00.000Z',
        updatedAt: '2026-07-11T12:00:00.000Z',
      },
      {
        artifactId: 'persistent-export-preview-page',
        projectId: project.projectId,
        kind: 'preview_page_svg',
        scope: 'page',
        status: 'ready',
        pageKey: 'page-1',
        runId: project.lastRunId,
        storageKey: 'projects/persistent-export-action/svg_output/01_cover.svg',
        createdAt: '2026-07-11T12:00:00.000Z',
        updatedAt: '2026-07-11T12:00:00.000Z',
      },
    ];
    let checkpoints: WorkflowCheckpoint[] = [
      {
        checkpointId: 'persistent-export-preview-synced',
        projectId: project.projectId,
        stage: 'preview_synced',
        status: 'completed',
        statusBefore: 'generation_in_progress',
        statusAfter: 'preview_available',
        artifactIds: ['persistent-export-preview-bundle', 'persistent-export-preview-page'],
        note: 'Runtime preview is complete and eligible for export.',
        createdAt: '2026-07-11T12:00:00.000Z',
      },
    ];
    const dependencies = {
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
        async listByProjectId(projectId: string): Promise<ProductArtifactRef[]> {
          return artifacts.filter((artifact) => artifact.projectId === projectId);
        },
        async createMany(newArtifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]> {
          artifacts = [...artifacts, ...newArtifacts];
          return newArtifacts;
        },
      },
      checkpoints: {
        async getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null> {
          return checkpoints.filter((checkpoint) => checkpoint.projectId === projectId).at(-1) ?? null;
        },
        async listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]> {
          return checkpoints.filter((checkpoint) => checkpoint.projectId === projectId);
        },
        async create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint> {
          checkpoints = [...checkpoints, checkpoint];
          return checkpoint;
        },
      },
    };

    const initialGet = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'GET',
      url: `/projects/${project.projectId}`,
    });
    assert.equal(initialGet.status, 200, 'a runtime-proven preview should load in the workbench');
    assert.match(initialGet.body, /<button[^>]*data-action-code="export_pptx"/, 'the eligible export action should render as a Workbench control');
    assert.doesNotMatch(initialGet.body, new RegExp(fixture.workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the Workbench must not leak the server workspace path');
    assert.doesNotMatch(initialGet.body, /<dt>Workspace<\/dt>/, 'the Workbench must not render a workspace metadata row');

    checkpoints = [];
    const missingProof = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'POST',
      url: `/projects/${project.projectId}`,
      body: JSON.stringify({ action: 'export_pptx' }),
    });
    assert.equal(missingProof.status, 400, 'export should reject preview status without its completed runtime checkpoint');
    assert.match(missingProof.body, /requires completed current-run preview evidence/);
    assert.equal(project.status, 'preview_available', 'a rejected export must not transition the project');
    assert.equal(artifacts.length, 2, 'a rejected export must not add artifacts');
    assert.equal(checkpoints.length, 0, 'a rejected export must not add checkpoints');
    checkpoints = [
      {
        checkpointId: 'persistent-export-preview-synced',
        projectId: project.projectId,
        stage: 'preview_synced',
        status: 'completed',
        statusBefore: 'generation_in_progress',
        statusAfter: 'preview_available',
        artifactIds: ['persistent-export-preview-bundle', 'persistent-export-preview-page'],
        note: 'Runtime preview is complete and eligible for export.',
        createdAt: '2026-07-11T12:00:00.000Z',
      },
    ];

    const response = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'POST',
      url: `/projects/${project.projectId}`,
      body: JSON.stringify({ action: 'export_pptx' }),
    });

    assert.equal(response.status, 200, 'a runtime-proven preview should execute the export action');
    assert.equal(project.status, 'export_ready', 'the route should persist the export transition');
    assert.ok(artifacts.some((artifact) => artifact.kind === 'export_pptx' && artifact.status === 'ready'), 'the route should persist the exported PPTX artifact');
    assert.ok(checkpoints.some((checkpoint) => checkpoint.stage === 'export_ready' && checkpoint.status === 'completed'), 'the route should persist the completed export checkpoint');

    const freshGet = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'GET',
      url: `/projects/${project.projectId}`,
    });
    assert.equal(freshGet.status, 200, 'a fresh route read should load the persisted export state');
    assert.match(freshGet.body, /Exported PPTX deliverable|Export ready/, 'the persistent workbench should present the exported delivery');

    const artifactCountAfterSuccess = artifacts.length;
    const checkpointCountAfterSuccess = checkpoints.length;
    const duplicate = await handleProjectWorkbenchHttpRequest(dependencies, {
      method: 'POST',
      url: `/projects/${project.projectId}`,
      body: JSON.stringify({ action: 'export_pptx' }),
    });
    assert.equal(duplicate.status, 400, 'a duplicate export must not silently re-export an export_ready project');
    assert.equal(artifacts.length, artifactCountAfterSuccess, 'a duplicate export must not add artifacts');
    assert.equal(checkpoints.length, checkpointCountAfterSuccess, 'a duplicate export must not add checkpoints');

    console.log('project workbench export PPTX action test: ok');
  } finally {
    fixture.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
