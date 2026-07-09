import assert from 'node:assert/strict';

import { toProjectViewModel } from '../backend/services/project-view-service';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects';

function main() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-strategist-honesty-project',
    name: 'PPTMASTER Strategist Honesty Project',
    status: 'spec_ready',
    workspace: {
      projectId: 'pptmaster-strategist-honesty-project',
      workspacePath: 'projects/pptmaster-strategist-honesty-project',
    },
    latestCheckpointId: 'checkpoint-strategist-synced',
    createdAt: '2026-07-07T12:00:00.000Z',
    updatedAt: '2026-07-07T12:15:00.000Z',
  };

  const artifacts: ProductArtifactRef[] = [
    {
      artifactId: 'design-spec',
      projectId: project.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'pending',
      label: 'Strategist design specification (unverified)',
      storageKey: `${project.workspace.workspacePath}/design_spec.md`,
      mimeType: 'text/markdown',
      metadata: {
        role: 'strategist_output',
        verification: 'unverified_runtime_bridge',
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
    {
      artifactId: 'spec-lock',
      projectId: project.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'pending',
      label: 'Executor entry spec lock (unverified)',
      storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
      mimeType: 'text/markdown',
      metadata: {
        role: 'strategist_output',
        verification: 'unverified_runtime_bridge',
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
  ];

  const checkpoint: WorkflowCheckpoint = {
    checkpointId: 'checkpoint-strategist-synced',
    projectId: project.projectId,
    stage: 'strategist_artifacts_synced',
    status: 'completed',
    statusBefore: 'confirmation_locked',
    statusAfter: 'spec_ready',
    artifactIds: artifacts.map((artifact) => artifact.artifactId),
    createdAt: project.updatedAt,
  };

  const viewModel = toProjectViewModel(project, artifacts, [], checkpoint);

  const strategistCard = viewModel.workbench.summaryCards.find((card) => card.key === 'strategist');
  assert.ok(strategistCard);
  assert.equal(strategistCard?.tone, 'warning');
  assert.match(strategistCard?.value ?? '', /pending runtime verification/i);

  const strategistSection = viewModel.workbench.sections.find((section) => section.key === 'strategist');
  assert.ok(strategistSection);
  assert.equal(strategistSection?.status, 'warning');
  assert.match(strategistSection?.description ?? '', /real strategist runtime bridge exists/i);
  assert.ok(strategistSection?.badges?.some((badge) => /unverified runtime output/i.test(badge.text)));

  console.log('project view strategist honesty test: ok');
}

main();
