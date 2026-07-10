import assert from 'node:assert/strict';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { WorkflowCheckpoint, ProjectRecord } from '../backend/models/projects.ts';
import { renderProjectWorkbenchPage } from '../app/project-workbench-page.ts';

function createMemoryProjectRepository(project: ProjectRecord) {
  return {
    async getById(projectId: string): Promise<ProjectRecord | null> {
      return projectId === project.projectId ? project : null;
    },
  };
}

function createMemoryArtifactRepository(artifacts: ProductArtifactRef[]) {
  return {
    async listByProjectId(projectId: string): Promise<ProductArtifactRef[]> {
      return artifacts.filter((artifact) => artifact.projectId === projectId);
    },
  };
}

function createMemoryCheckpointRepository(checkpoints: WorkflowCheckpoint[]) {
  return {
    async getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null> {
      const matching = checkpoints.filter((checkpoint) => checkpoint.projectId === projectId);
      return matching.length > 0 ? matching[matching.length - 1] ?? null : null;
    },
    async listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]> {
      return checkpoints.filter((checkpoint) => checkpoint.projectId === projectId);
    },
  };
}

async function main() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-workbench-page-project',
    name: 'PPTMASTER Workbench Page Project',
    status: 'generation_in_progress',
    workspace: {
      projectId: 'pptmaster-workbench-page-project',
      workspacePath: 'projects/pptmaster-workbench-page-project',
    },
    lastRunId: 'run-001',
    createdAt: '2026-07-10T05:05:00.000Z',
    updatedAt: '2026-07-10T05:25:00.000Z',
  };

  const artifacts: ProductArtifactRef[] = [
    {
      artifactId: 'pptmaster-workbench-page-project-source-1',
      projectId: project.projectId,
      kind: 'source_original',
      scope: 'source',
      status: 'ready',
      label: 'Seed memo',
      sourceId: 'source-1',
      storageKey: 'projects/pptmaster-workbench-page-project/sources/source-1.md',
      mimeType: 'text/markdown',
      createdAt: '2026-07-10T05:06:00.000Z',
      updatedAt: '2026-07-10T05:06:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-confirmations',
      projectId: project.projectId,
      kind: 'confirmation_recommendations',
      scope: 'project',
      status: 'ready',
      label: 'Confirmation recommendations',
      storageKey: 'projects/pptmaster-workbench-page-project/confirmations/recommendations.json',
      mimeType: 'application/json',
      createdAt: '2026-07-10T05:10:00.000Z',
      updatedAt: '2026-07-10T05:10:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-design-spec',
      projectId: project.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'ready',
      label: 'Design spec',
      storageKey: 'projects/pptmaster-workbench-page-project/design_spec.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'runtime_bridge_verified' },
      createdAt: '2026-07-10T05:15:00.000Z',
      updatedAt: '2026-07-10T05:15:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-spec-lock',
      projectId: project.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'ready',
      label: 'Spec lock',
      storageKey: 'projects/pptmaster-workbench-page-project/spec_lock.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'runtime_bridge_verified' },
      createdAt: '2026-07-10T05:15:00.000Z',
      updatedAt: '2026-07-10T05:15:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-preview-bundle',
      projectId: project.projectId,
      kind: 'preview_bundle',
      scope: 'run',
      status: 'ready',
      label: 'Preview bundle',
      runId: 'run-001',
      storageKey: 'projects/pptmaster-workbench-page-project/preview/index.json',
      mimeType: 'application/json',
      createdAt: '2026-07-10T05:20:00.000Z',
      updatedAt: '2026-07-10T05:20:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-page-1',
      projectId: project.projectId,
      kind: 'preview_page_svg',
      scope: 'page',
      status: 'ready',
      label: 'Preview page page-1',
      pageKey: 'page-1',
      runId: 'run-001',
      storageKey: 'projects/pptmaster-workbench-page-project/svg_output/01_cover.svg',
      mimeType: 'image/svg+xml',
      metadata: {
        title: 'Preview page page-1',
        pageKey: 'page-1',
        generationProvenance: {
          filename: '01_cover.svg',
        },
      },
      createdAt: '2026-07-10T05:20:00.000Z',
      updatedAt: '2026-07-10T05:20:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-export-pptx',
      projectId: project.projectId,
      kind: 'export_pptx',
      scope: 'run',
      status: 'ready',
      label: 'PPTX export',
      runId: 'run-001',
      storageKey: 'projects/pptmaster-workbench-page-project/exports/deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      metadata: {
        filename: 'deck.pptx',
        manifestStorageKey: 'projects/pptmaster-workbench-page-project/exports/deck_files/image_manifest.json',
      },
      createdAt: '2026-07-10T05:22:00.000Z',
      updatedAt: '2026-07-10T05:22:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-project-runtime-log',
      projectId: project.projectId,
      kind: 'runtime_log',
      scope: 'run',
      status: 'ready',
      label: 'Runtime log',
      runId: 'run-001',
      storageKey: 'projects/pptmaster-workbench-page-project/exports/deck.md',
      mimeType: 'text/markdown',
      metadata: {
        filename: 'deck.md',
      },
      createdAt: '2026-07-10T05:22:30.000Z',
      updatedAt: '2026-07-10T05:22:30.000Z',
    },
  ];

  const latestCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'checkpoint-preview-synced-001',
    projectId: project.projectId,
    stage: 'preview_synced',
    status: 'completed',
    statusBefore: 'generation_in_progress',
    statusAfter: 'preview_available',
    artifactIds: ['pptmaster-workbench-page-project-preview-bundle', 'pptmaster-workbench-page-project-page-1'],
    note: 'Preview synced after the first page landed.',
    createdAt: '2026-07-10T05:21:00.000Z',
  };

  const startedCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'checkpoint-generation-started-001',
    projectId: project.projectId,
    stage: 'generation_started',
    status: 'started',
    statusBefore: 'spec_ready',
    statusAfter: 'generation_in_progress',
    artifactIds: [],
    note: 'Generation is running in the local workbench shell.',
    createdAt: '2026-07-10T05:18:00.000Z',
  };

  const recommendations = [
    {
      key: 'audience',
      title: 'Target audience',
      recommendation: 'Focus the narrative on founders preparing for a seed pitch.',
    },
    {
      key: 'goal',
      title: 'Primary goal',
      recommendation: 'Keep the deck tightly scoped around fundraising traction.',
    },
    {
      key: 'tone',
      title: 'Tone',
      recommendation: 'Use a confident but calm investor-facing tone.',
    },
    {
      key: 'language',
      title: 'Language',
      recommendation: 'Author the deck in Chinese for the live room.',
    },
    {
      key: 'brand',
      title: 'Brand constraints',
      recommendation: 'Stay close to the existing PPTMASTER identity baseline.',
    },
    {
      key: 'outline',
      title: 'Narrative structure',
      recommendation: 'Use a problem-solution-traction sequence.',
    },
    {
      key: 'visual_style',
      title: 'Visual style',
      recommendation: 'Prefer a dark, minimal workbench treatment.',
    },
    {
      key: 'delivery',
      title: 'Delivery mode',
      recommendation: 'Optimize for a live founder pitch.',
    },
  ];

  const page = await renderProjectWorkbenchPage(
    {
      projects: createMemoryProjectRepository(project),
      artifacts: createMemoryArtifactRepository(artifacts),
      checkpoints: createMemoryCheckpointRepository([startedCheckpoint, latestCheckpoint]),
      loadRecommendations: async (projectId: string) => (projectId === project.projectId ? recommendations : []),
    },
    project.projectId,
  );

  assert.equal(page.status, 200, 'known project should return success');
  assert.equal(page.contentType, 'text/html; charset=utf-8');
  assert.equal(page.project.projectId, project.projectId);
  assert.equal(page.viewModel.projectId, project.projectId);
  assert.match(page.body, /<!doctype html>/i, 'page should render a full html document');
  assert.match(page.body, /<title>PPTMASTER Workbench Page Project — workbench<\/title>/, 'page title should use project name in the workbench shell document title');
  assert.match(page.body, /<main[^>]+aria-labelledby="project-title"/, 'page should preserve the shell accessibility landmark');
  assert.match(page.body, /<a class="skip-link" href="#panel-confirmations">Skip to primary workbench panel<\/a>/, 'page should preserve the shell skip link into the primary panel');
  assert.match(page.body, /Workbench directory/, 'page should include the shell directory slice');
  assert.match(page.body, /href="#panel-confirmations" aria-current="page">Confirmation submission<\/a>/, 'confirmation submission should remain the primary directory anchor while unanswered confirmations still exist');
  assert.match(page.body, /href="#panel-checkpoint">Workflow checkpoint<\/a>/, 'page directory should expose the workflow checkpoint panel when checkpoint data exists');
  assert.match(page.body, /Workflow status/, 'page should include the shell workflow status slice');
  assert.match(page.body, /Project timeline/, 'page should include the shell timeline slice');
  assert.match(page.body, /Preview assets/, 'page should include the preview panel');
  assert.match(page.body, /href="#panel-delivery">Delivery package<\/a>/, 'page directory should expose the delivery package panel when delivery data exists');
  assert.match(page.body, /href="#panel-checkpoint">Workflow checkpoint<\/a>/, 'page directory should include the checkpoint slice when checkpoint data exists');
  assert.match(page.body, /checkpoint-preview-synced-001/, 'page checkpoint panel should show the latest projected checkpoint id');
  assert.match(page.body, /Preview synced/, 'page checkpoint panel should show the latest projected checkpoint stage');
  assert.match(page.body, /Completed/, 'page checkpoint panel should show the latest projected checkpoint status');
  assert.match(page.body, /Preview synced after the first page landed\./, 'page checkpoint panel should show the latest projected checkpoint note');
  assert.match(page.body, /<li>pptmaster-workbench-page-project-preview-bundle<\/li>/, 'page checkpoint panel should list checkpoint artifact ids');
  assert.doesNotMatch(page.body, /<li>checkpoint-preview-synced-001<\/li>/, 'page checkpoint artifact list should not repeat the checkpoint id itself');
  assert.match(page.body, /data-panel="delivery"/, 'page should include the dedicated delivery package panel when delivery artifacts are projected');
  assert.match(page.body, /<section[^>]+id="panel-delivery"[^>]+data-panel="delivery"/, 'page delivery panel should keep the dedicated delivery panel identity');
  assert.match(page.body, /<h2 id="panel-delivery-title">Delivery package<\/h2>/, 'page delivery panel should expose an accessible delivery heading');
  assert.match(page.body, /<dt>Primary artifact<\/dt><dd>pptmaster-workbench-page-project-export-pptx<\/dd>/, 'page delivery panel should disclose the primary delivery artifact id');
  assert.match(page.body, /<dt>Primary label<\/dt><dd>PPTX export<\/dd>/, 'page delivery panel should disclose the primary delivery label');
  assert.match(page.body, /<dt>Primary storage key<\/dt><dd>projects\/pptmaster-workbench-page-project\/exports\/deck\.pptx<\/dd>/, 'page delivery panel should disclose the primary delivery storage key');
  assert.match(page.body, /<dt>Companion artifact count<\/dt><dd>1<\/dd>/, 'page delivery panel should disclose the projected companion artifact count');
  assert.match(page.body, /data-role="primary" data-kind="export_pptx"/, 'page delivery panel should label the primary delivery artifact row');
  assert.match(page.body, /data-role="companion" data-kind="runtime_log"/, 'page delivery panel should label companion delivery artifact rows');

  const strategistPendingProject: ProjectRecord = {
    ...project,
    projectId: 'pptmaster-workbench-page-strategist-pending',
    name: 'PPTMASTER Workbench Strategist Pending Project',
    status: 'spec_ready',
    workspace: {
      projectId: 'pptmaster-workbench-page-strategist-pending',
      workspacePath: 'projects/pptmaster-workbench-page-strategist-pending',
    },
    updatedAt: '2026-07-10T05:17:00.000Z',
  };

  const strategistPendingArtifacts: ProductArtifactRef[] = [
    {
      artifactId: 'pptmaster-workbench-page-strategist-pending-design-spec',
      projectId: strategistPendingProject.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'pending',
      label: 'Strategist design spec',
      storageKey: 'projects/pptmaster-workbench-page-strategist-pending/design_spec.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'unverified_runtime_bridge' },
      createdAt: '2026-07-10T05:15:00.000Z',
      updatedAt: '2026-07-10T05:15:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-strategist-pending-spec-lock',
      projectId: strategistPendingProject.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'pending',
      label: 'Strategist spec lock',
      storageKey: 'projects/pptmaster-workbench-page-strategist-pending/spec_lock.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'unverified_runtime_bridge' },
      createdAt: '2026-07-10T05:15:00.000Z',
      updatedAt: '2026-07-10T05:15:00.000Z',
    },
  ];

  const strategistPendingRecommendations = recommendations.map((recommendation) => ({
    ...recommendation,
    recommendation: `${recommendation.recommendation} (pending strategist verification)`,
  }));

  const strategistPendingPage = await renderProjectWorkbenchPage(
    {
      projects: createMemoryProjectRepository(strategistPendingProject),
      artifacts: createMemoryArtifactRepository(strategistPendingArtifacts),
      checkpoints: createMemoryCheckpointRepository([]),
      loadRecommendations: async () => strategistPendingRecommendations,
    },
    strategistPendingProject.projectId,
  );

  assert.equal(strategistPendingPage.status, 200, 'spec-ready strategist handoff page should still render inside the workbench shell');
  assert.match(strategistPendingPage.body, /<a class="skip-link" href="#panel-confirmations">Skip to primary workbench panel<\/a>/, 'page should keep confirmations primary when the shell still has unanswered confirmation input');
  assert.match(strategistPendingPage.body, /href="#panel-confirmations" aria-current="page">Confirmation submission<\/a>/, 'page directory should keep the confirmation slice active while confirmation input remains available');
  assert.match(strategistPendingPage.body, /href="#panel-strategist">Strategist runtime verification<\/a>/, 'page should still include the strategist directory entry when runtime verification is pending');
  assert.doesNotMatch(strategistPendingPage.body, /href="#panel-delivery">Delivery package<\/a>/, 'page directory should keep the delivery package panel absent when no delivery projection exists');
  assert.match(strategistPendingPage.body, /Pending runtime bridge verification/, 'page should disclose pending strategist runtime verification state');
  assert.match(strategistPendingPage.body, /Generation handoff locked: wait for runtime bridge verification before starting page generation\./, 'page should keep generation blocked while strategist runtime verification is pending');
  assert.match(strategistPendingPage.body, /data-panel="strategist"/, 'page should include the dedicated strategist handoff panel');

  const missing = await renderProjectWorkbenchPage(
    {
      projects: createMemoryProjectRepository(project),
      artifacts: createMemoryArtifactRepository(artifacts),
      checkpoints: createMemoryCheckpointRepository([startedCheckpoint, latestCheckpoint]),
      loadRecommendations: async () => recommendations,
    },
    'missing-project-id',
  );

  assert.equal(missing.status, 404, 'unknown project should return not found');
  assert.equal(missing.contentType, 'text/html; charset=utf-8');
  assert.match(missing.body, /<main[^>]+data-status="not_found"[^>]+data-project-id="missing-project-id"/, 'missing project page should expose an escaped project identity for page-level recovery tooling');
  assert.match(missing.body, /Project workbench unavailable/, 'missing project page should explain the absence honestly');
  assert.match(missing.body, /missing-project-id/, 'missing project page should mention the requested project id');

  const unavailable = await renderProjectWorkbenchPage(
    {
      projects: {
        async getById(): Promise<ProjectRecord | null> {
          throw new Error('project repository temporarily unavailable');
        },
      },
      artifacts: createMemoryArtifactRepository(artifacts),
      checkpoints: createMemoryCheckpointRepository([startedCheckpoint, latestCheckpoint]),
    },
    project.projectId,
  );

  assert.equal(unavailable.status, 500, 'repository failures should render a page-level unavailable state instead of escaping the page boundary');
  assert.equal(unavailable.contentType, 'text/html; charset=utf-8');
  assert.match(unavailable.body, /<main[^>]+data-status="unavailable"[^>]+data-project-id="pptmaster-workbench-page-project"/, 'unavailable pages should retain the requested project identity for recovery tooling');
  assert.match(unavailable.body, /Project workbench temporarily unavailable/, 'unavailable pages should explain the transient page state honestly');

  const unavailableDuringShellLoad = await renderProjectWorkbenchPage(
    {
      projects: createMemoryProjectRepository(project),
      artifacts: {
        async listByProjectId(): Promise<ProductArtifactRef[]> {
          throw new Error('artifact repository temporarily unavailable');
        },
      },
      checkpoints: createMemoryCheckpointRepository([startedCheckpoint, latestCheckpoint]),
      loadRecommendations: async () => recommendations,
    },
    project.projectId,
  );

  assert.equal(unavailableDuringShellLoad.status, 500, 'shell-data repository failures should remain inside the page-level unavailable boundary');
  assert.equal(unavailableDuringShellLoad.contentType, 'text/html; charset=utf-8');
  assert.match(unavailableDuringShellLoad.body, /<main[^>]+data-status="unavailable"[^>]+data-project-id="pptmaster-workbench-page-project"/, 'shell-data failures should retain the requested project identity for recovery tooling');
  assert.match(unavailableDuringShellLoad.body, /Project workbench temporarily unavailable/, 'shell-data failures should render the same honest transient page state');

  const strategistGateProject: ProjectRecord = {
    projectId: 'pptmaster-workbench-page-strategist-project',
    name: 'PPTMASTER Workbench Page Strategist Project',
    status: 'spec_ready',
    workspace: {
      projectId: 'pptmaster-workbench-page-strategist-project',
      workspacePath: 'projects/pptmaster-workbench-page-strategist-project',
    },
    lastRunId: 'run-strategist-001',
    createdAt: '2026-07-10T05:30:00.000Z',
    updatedAt: '2026-07-10T05:36:00.000Z',
  };

  const strategistGateArtifacts: ProductArtifactRef[] = [
    {
      artifactId: 'pptmaster-workbench-page-strategist-project-source-1',
      projectId: strategistGateProject.projectId,
      kind: 'source_original',
      scope: 'source',
      status: 'ready',
      label: 'Seed memo',
      sourceId: 'source-1',
      storageKey: 'projects/pptmaster-workbench-page-strategist-project/sources/source-1.md',
      mimeType: 'text/markdown',
      createdAt: '2026-07-10T05:30:30.000Z',
      updatedAt: '2026-07-10T05:30:30.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-strategist-project-confirmation-recs',
      projectId: strategistGateProject.projectId,
      kind: 'confirmation_recommendations',
      scope: 'project',
      status: 'ready',
      label: 'Confirmation recommendations',
      storageKey: 'projects/pptmaster-workbench-page-strategist-project/confirmations/recommendations.json',
      mimeType: 'application/json',
      createdAt: '2026-07-10T05:31:00.000Z',
      updatedAt: '2026-07-10T05:31:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-strategist-project-confirmation-result',
      projectId: strategistGateProject.projectId,
      kind: 'confirmation_result',
      scope: 'project',
      status: 'locked',
      label: 'Locked confirmations',
      storageKey: 'projects/pptmaster-workbench-page-strategist-project/confirmations/answers.json',
      mimeType: 'application/json',
      metadata: {
        answers: {
          audience: 'Founders preparing an investor pitch.',
          goal: 'Secure interest for a follow-up partner meeting.',
          tone: 'Crisp and confident.',
          language: 'zh-CN',
          brand: 'PPTMASTER',
          outline: 'problem-solution-traction',
          visual_style: 'minimal dark editorial',
          delivery: 'live pitch',
        },
      },
      createdAt: '2026-07-10T05:32:00.000Z',
      updatedAt: '2026-07-10T05:32:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-strategist-project-design-spec',
      projectId: strategistGateProject.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'pending',
      label: 'Design spec',
      storageKey: 'projects/pptmaster-workbench-page-strategist-project/design_spec.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'unverified_runtime_bridge' },
      createdAt: '2026-07-10T05:34:00.000Z',
      updatedAt: '2026-07-10T05:34:00.000Z',
    },
    {
      artifactId: 'pptmaster-workbench-page-strategist-project-spec-lock',
      projectId: strategistGateProject.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'pending',
      label: 'Spec lock',
      storageKey: 'projects/pptmaster-workbench-page-strategist-project/spec_lock.md',
      mimeType: 'text/markdown',
      metadata: { verification: 'unverified_runtime_bridge' },
      createdAt: '2026-07-10T05:34:00.000Z',
      updatedAt: '2026-07-10T05:34:00.000Z',
    },
  ];

  const strategistCheckpoint: WorkflowCheckpoint = {
    checkpointId: 'checkpoint-strategist-artifacts-synced-001',
    projectId: strategistGateProject.projectId,
    stage: 'strategist_artifacts_synced',
    status: 'completed',
    statusBefore: 'confirmation_locked',
    statusAfter: 'spec_ready',
    artifactIds: [
      'pptmaster-workbench-page-strategist-project-design-spec',
      'pptmaster-workbench-page-strategist-project-spec-lock',
    ],
    note: 'Strategist artifacts landed but still await runtime bridge verification.',
    createdAt: '2026-07-10T05:35:00.000Z',
  };

  const strategistPage = await renderProjectWorkbenchPage(
    {
      projects: createMemoryProjectRepository(strategistGateProject),
      artifacts: createMemoryArtifactRepository(strategistGateArtifacts),
      checkpoints: createMemoryCheckpointRepository([strategistCheckpoint]),
      loadRecommendations: async (projectId: string) => (projectId === strategistGateProject.projectId ? recommendations : []),
    },
    strategistGateProject.projectId,
  );

  assert.equal(strategistPage.status, 200, 'strategist-gated project should still render successfully');
  assert.match(strategistPage.body, /Current phase: Strategist runtime verification/, 'page header should surface strategist verification as the current phase once confirmation lock is complete');
  assert.match(strategistPage.body, /<a class="skip-link" href="#panel-strategist">Skip to primary workbench panel<\/a>/, 'page should move the accessible skip target to strategist verification once that gate is current');
  assert.match(strategistPage.body, /href="#panel-strategist" aria-current="page">Strategist runtime verification<\/a>/, 'directory should mark strategist runtime verification as primary when the handoff gate is active');
  assert.match(strategistPage.body, /href="#panel-confirmations">Confirmation submission<\/a>/, 'directory should retain the locked confirmations panel as reviewable context');
  assert.match(strategistPage.body, /data-panel="strategist"/, 'page should render the dedicated strategist handoff panel');
  assert.match(strategistPage.body, /Pending runtime bridge verification/, 'strategist panel should disclose pending runtime verification honestly');
  assert.match(strategistPage.body, /Generation handoff locked: wait for runtime bridge verification before starting page generation\./, 'strategist panel should keep generation locked until runtime verification clears');

  const checkpointOnlyProject: ProjectRecord = {
    projectId: 'pptmaster-workbench-page-checkpoint-project',
    name: 'PPTMASTER Workbench Page Checkpoint Project',
    status: 'generation_in_progress',
    workspace: {
      projectId: 'pptmaster-workbench-page-checkpoint-project',
      workspacePath: 'projects/pptmaster-workbench-page-checkpoint-project',
    },
    createdAt: '2026-07-10T06:00:00.000Z',
    updatedAt: '2026-07-10T06:05:00.000Z',
  };

  const checkpointOnly = await renderProjectWorkbenchPage(
    {
      projects: createMemoryProjectRepository(checkpointOnlyProject),
      artifacts: createMemoryArtifactRepository([]),
      checkpoints: createMemoryCheckpointRepository([
        {
          checkpointId: 'checkpoint-workbench-only-001',
          projectId: checkpointOnlyProject.projectId,
          stage: 'generation_started',
          status: 'started',
          statusBefore: 'spec_ready',
          statusAfter: 'generation_in_progress',
          artifactIds: ['artifact-preview-page-001', 'artifact-preview-page-002'],
          note: 'Checkpoint-only workbench view for page-level shell verification.',
          createdAt: '2026-07-10T06:04:00.000Z',
        },
      ]),
      loadRecommendations: async () => [],
    },
    checkpointOnlyProject.projectId,
  );

  assert.equal(checkpointOnly.status, 200, 'checkpoint-only project should still render successfully');
  assert.match(checkpointOnly.body, /<a class="skip-link" href="#panel-timeline">Skip to primary workbench panel<\/a>/, 'page should preserve the timeline slice as primary when no checkpoint-specific timeline or section state marks checkpoint current');
  assert.match(checkpointOnly.body, /href="#panel-checkpoint">Workflow checkpoint<\/a>/, 'page directory should still expose the checkpoint panel when it is available as supporting workflow context');
  assert.doesNotMatch(checkpointOnly.body, /href="#panel-checkpoint" aria-current="page">Workflow checkpoint<\/a>/, 'checkpoint should not be marked primary unless the projection explicitly promotes it');
  assert.match(checkpointOnly.body, /data-panel="checkpoint"/, 'page should render the dedicated workflow checkpoint panel');
  assert.match(checkpointOnly.body, /<dt>Checkpoint ID<\/dt><dd>checkpoint-workbench-only-001<\/dd>/, 'checkpoint panel should show the projected checkpoint id');
  assert.match(checkpointOnly.body, /<dt>Storage key<\/dt><dd>projects\/pptmaster-workbench-page-checkpoint-project\/checkpoints\/checkpoint-workbench-only-001\.json<\/dd>/, 'checkpoint panel should surface the fallback checkpoint storage key for page rendering');
  assert.match(checkpointOnly.body, /<dt>Stage<\/dt><dd>Generation Started<\/dd>/, 'checkpoint panel should show the stage title in the full page render');
  assert.match(checkpointOnly.body, /<dt>Status<\/dt><dd>Started<\/dd>/, 'checkpoint panel should show the status title in the full page render');
  assert.match(checkpointOnly.body, /<dt>Created at<\/dt><dd>2026-07-10T06:04:00\.000Z<\/dd>/, 'checkpoint panel should show when the checkpoint was created');
  assert.match(checkpointOnly.body, /<dt>Note<\/dt><dd>Checkpoint-only workbench view for page-level shell verification\.<\/dd>/, 'checkpoint panel should show the checkpoint note in the full page render');
  assert.match(checkpointOnly.body, /<ul class="checkpoint-artifacts">\s*<li>artifact-preview-page-001<\/li>\s*<li>artifact-preview-page-002<\/li>\s*<\/ul>/, 'checkpoint panel should list any projected artifact ids for the active workflow checkpoint');
  assert.doesNotMatch(checkpointOnly.body, /<li>checkpoint-workbench-only-001<\/li>/, 'checkpoint-only artifact list should not repeat the checkpoint id itself');

  console.log('project workbench page slice test: ok');
}

void main();
