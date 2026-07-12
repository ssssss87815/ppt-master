import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';

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
      async listByProjectId(projectId: string): Promise<ProductArtifactRef[]> {
        return projectId === project.projectId ? artifacts : [];
      },
      async createMany(newArtifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]> {
        artifacts = [...artifacts, ...newArtifacts];
        return newArtifacts;
      },
    },
    checkpoints: {
      async getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null> {
        if (projectId !== project.projectId) {
          return null;
        }
        return checkpoints.at(-1) ?? null;
      },
      async listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]> {
        return projectId === project.projectId ? checkpoints : [];
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
  assert.equal(methodMiss.status, 400, 'POST without body should return 400 for action payload parsing');
  assert.match(methodMiss.body, /Malformed request body/i, 'POST without body should report body error');

  const legacyConfirmationPayload = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'POST',
    url: '/projects/pitch%20deck%20%2F%202026',
    body: JSON.stringify({ answers: {} }),
  });
  assert.equal(legacyConfirmationPayload.status, 400, 'legacy confirmation payloads remain confirmations and validate their answers');
  assert.match(legacyConfirmationPayload.body, /Invalid answers/i);

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

  const unsupportedAction = await handleProjectWorkbenchHttpRequest(dependencies(project), {
    method: 'POST',
    url: '/projects/pitch%20deck%20%2F%202026',
    body: JSON.stringify({ action: 'export_pptx' }),
  });
  assert.equal(unsupportedAction.status, 400, 'unsupported POST actions should be rejected honestly');
  assert.match(unsupportedAction.body, /Unsupported action: export_pptx/);

  let exportEligibleProjectWrites = 0;
  let exportEligibleArtifactWrites = 0;
  let exportEligibleCheckpointWrites = 0;
  const exportEligibleProject: ProjectRecord = {
    ...project,
    status: 'preview_available',
    lastRunId: 'pitch-deck-preview-run',
  };
  const previewBundle: ProductArtifactRef = {
    artifactId: 'pitch-deck-preview-bundle',
    projectId: exportEligibleProject.projectId,
    kind: 'preview_bundle',
    scope: 'run',
    status: 'ready',
    label: 'Preview bundle',
    runId: exportEligibleProject.lastRunId,
    storageKey: 'projects/pitch-deck-route-proof/preview',
    createdAt: '2026-07-10T10:20:00.000Z',
    updatedAt: '2026-07-10T10:20:00.000Z',
  };
  const previewPage: ProductArtifactRef = {
    artifactId: 'pitch-deck-preview-page',
    projectId: exportEligibleProject.projectId,
    kind: 'preview_page_svg',
    scope: 'page',
    status: 'ready',
    label: 'Preview page',
    pageKey: 'page-1',
    runId: exportEligibleProject.lastRunId,
    storageKey: 'projects/pitch-deck-route-proof/preview/page-1.svg',
    createdAt: '2026-07-10T10:20:00.000Z',
    updatedAt: '2026-07-10T10:20:00.000Z',
  };
  const previewCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'pitch-deck-preview-synced',
    projectId: exportEligibleProject.projectId,
    stage: 'preview_synced',
    status: 'completed',
    statusBefore: 'generation_in_progress',
    statusAfter: 'preview_available',
    artifactIds: [previewBundle.artifactId, previewPage.artifactId],
    createdAt: '2026-07-10T10:20:00.000Z',
  };
  const exportEligibleDependencies = {
    projects: {
      async getById(projectId: string): Promise<ProjectRecord | null> {
        return projectId === exportEligibleProject.projectId ? exportEligibleProject : null;
      },
      async update(updatedProject: ProjectRecord): Promise<ProjectRecord> {
        exportEligibleProjectWrites += 1;
        return updatedProject;
      },
    },
    artifacts: {
      async listByProjectId(projectId: string): Promise<ProductArtifactRef[]> {
        return projectId === exportEligibleProject.projectId ? [previewBundle, previewPage] : [];
      },
      async createMany(newArtifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]> {
        exportEligibleArtifactWrites += 1;
        return newArtifacts;
      },
    },
    checkpoints: {
      async getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null> {
        return projectId === exportEligibleProject.projectId ? previewCheckpoint : null;
      },
      async listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]> {
        return projectId === exportEligibleProject.projectId ? [previewCheckpoint] : [];
      },
      async create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint> {
        exportEligibleCheckpointWrites += 1;
        return checkpoint;
      },
    },
  };
  const exportEligibleView = await handleProjectWorkbenchHttpRequest(exportEligibleDependencies, {
    method: 'GET',
    url: '/projects/pitch%20deck%20%2F%202026',
  });
  assert.equal(exportEligibleView.status, 200, 'completed current-run preview evidence should project the adjacent export action');
  assert.match(exportEligibleView.body, /data-action-code="export_pptx"/, 'the workbench should expose export as the next projected action');
  assert.match(exportEligibleView.body, /Runtime action unavailable in this read-only workbench\./, 'the workbench must describe export as unavailable rather than fabricate an execution control');

  const rejectedEligibleExport = await handleProjectWorkbenchHttpRequest(exportEligibleDependencies, {
    method: 'POST',
    url: '/projects/pitch%20deck%20%2F%202026',
    body: JSON.stringify({ action: 'export_pptx' }),
  });
  assert.equal(rejectedEligibleExport.status, 400, 'runtime-eligible export remains unavailable without a persisted workbench action boundary');
  assert.match(rejectedEligibleExport.body, /Unsupported action: export_pptx/);
  assert.equal(exportEligibleProjectWrites, 0, 'rejected export must not update the project');
  assert.equal(exportEligibleArtifactWrites, 0, 'rejected export must not create artifacts');
  assert.equal(exportEligibleCheckpointWrites, 0, 'rejected export must not create checkpoints');

  let rejectedTransitionUpdates = 0;
  let rejectedTransitionArtifactWrites = 0;
  let rejectedTransitionCheckpointWrites = 0;
  const rejectedTransition = await handleProjectWorkbenchHttpRequest(
    {
      projects: {
        async getById(projectId: string): Promise<ProjectRecord | null> {
          return projectId === project.projectId ? project : null;
        },
        async update(updatedProject: ProjectRecord): Promise<ProjectRecord> {
          rejectedTransitionUpdates += 1;
          return updatedProject;
        },
      },
      artifacts: {
        async listByProjectId(): Promise<ProductArtifactRef[]> {
          return [];
        },
        async createMany(newArtifacts: ProductArtifactRef[]): Promise<ProductArtifactRef[]> {
          rejectedTransitionArtifactWrites += 1;
          return newArtifacts;
        },
      },
      checkpoints: {
        async getLatestByProjectId(): Promise<WorkflowCheckpoint | null> {
          return null;
        },
        async listByProjectId(): Promise<WorkflowCheckpoint[]> {
          return [];
        },
        async create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint> {
          rejectedTransitionCheckpointWrites += 1;
          return checkpoint;
        },
      },
    },
    {
      method: 'POST',
      url: '/projects/pitch%20deck%20%2F%202026',
      body: JSON.stringify({ action: 'start_generation' }),
    },
  );
  assert.equal(rejectedTransition.status, 400, 'start_generation should reject projects that are not spec_ready');
  assert.match(rejectedTransition.body, /Invalid transition: start_generation requires spec_ready status; received draft/);
  assert.equal(rejectedTransitionUpdates, 0, 'rejected start_generation must not update the project');
  assert.equal(rejectedTransitionArtifactWrites, 0, 'rejected start_generation must not create artifacts');
  assert.equal(rejectedTransitionCheckpointWrites, 0, 'rejected start_generation must not create checkpoints');

  const unverifiedProject: ProjectRecord = { ...project, status: 'spec_ready' };
  const unverifiedStrategistArtifacts: ProductArtifactRef[] = [
    {
      artifactId: 'pitch-deck-unverified-design-spec',
      projectId: unverifiedProject.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'ready',
      label: 'Unverified design spec',
      storageKey: 'projects/pitch-deck-route-proof/design_spec.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'unverified_runtime_bridge' },
      createdAt: '2026-07-10T10:20:00.000Z',
      updatedAt: '2026-07-10T10:20:00.000Z',
    },
    {
      artifactId: 'pitch-deck-unverified-spec-lock',
      projectId: unverifiedProject.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'ready',
      label: 'Unverified spec lock',
      storageKey: 'projects/pitch-deck-route-proof/spec_lock.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'unverified_runtime_bridge' },
      createdAt: '2026-07-10T10:20:00.000Z',
      updatedAt: '2026-07-10T10:20:00.000Z',
    },
  ];
  const unverifiedStart = await handleProjectWorkbenchHttpRequest(
    dependencies(unverifiedProject, unverifiedStrategistArtifacts),
    {
      method: 'POST',
      url: '/projects/pitch%20deck%20%2F%202026',
      body: JSON.stringify({ action: 'start_generation' }),
    },
  );
  assert.equal(unverifiedStart.status, 400, 'start_generation should reject unverified strategist handoffs');
  assert.match(unverifiedStart.body, /Invalid transition: start_generation requires verified strategist outputs/i);

  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-workbench-route-generation-'));
  const generationWorkspace = path.join(root, 'runtime-workspace');
  try {
    cpSync(path.resolve('productization/test-fixtures/runtime-workspace'), generationWorkspace, { recursive: true });
    const strategistRunId = 'pitch-deck-strategist-run';
    const generationProject: ProjectRecord = {
      ...project,
      status: 'spec_ready',
      workspace: {
        projectId: project.projectId,
        workspacePath: generationWorkspace,
      },
      lastRunId: strategistRunId,
      latestCheckpointId: 'pitch-deck-spec-ready',
    };
    const generationArtifacts: ProductArtifactRef[] = [
      {
        artifactId: 'pitch-deck-confirmation-result',
        projectId: generationProject.projectId,
        kind: 'confirmation_result',
        scope: 'project',
        status: 'ready',
        runId: strategistRunId,
        label: 'Locked confirmation result',
        storageKey: `${generationWorkspace}/confirmations/result.json`,
        mimeType: 'application/json',
        metadata: { lockedAt: '2026-07-10T10:20:00.000Z' },
        createdAt: '2026-07-10T10:20:00.000Z',
        updatedAt: '2026-07-10T10:20:00.000Z',
      },
      {
        artifactId: 'pitch-deck-design-spec',
        projectId: generationProject.projectId,
        kind: 'design_spec',
        scope: 'project',
        status: 'ready',
        runId: strategistRunId,
        label: 'Design spec',
        storageKey: `${generationWorkspace}/design_spec.md`,
        mimeType: 'text/markdown',
        metadata: { verification: 'materialized_from_locked_confirmations' },
        createdAt: '2026-07-10T10:20:00.000Z',
        updatedAt: '2026-07-10T10:20:00.000Z',
      },
      {
        artifactId: 'pitch-deck-spec-lock',
        projectId: generationProject.projectId,
        kind: 'spec_lock',
        scope: 'project',
        status: 'locked',
        runId: strategistRunId,
        label: 'Spec lock',
        storageKey: `${generationWorkspace}/spec_lock.md`,
        mimeType: 'text/markdown',
        metadata: { verification: 'materialized_from_locked_confirmations' },
        createdAt: '2026-07-10T10:20:00.000Z',
        updatedAt: '2026-07-10T10:20:00.000Z',
      },
    ];

  const startGeneration = await handleProjectWorkbenchHttpRequest(
    dependencies(generationProject, generationArtifacts),
    {
      method: 'POST',
      url: '/projects/pitch%20deck%20%2F%202026',
      body: JSON.stringify({ action: 'start_generation' }),
    },
  );
  assert.equal(startGeneration.status, 200, 'start_generation should re-render the page after the runtime bridge persists generation start');
  assert.match(startGeneration.body, /Generation in progress|Preview assets|preview page/i, 'start_generation response should reflect the persisted generation phase');
  assert.match(startGeneration.body, /Preview|Start generation|Resume generation/i, 'start_generation response should render the updated workbench view');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log('project workbench http route test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
