import { strict as assert } from 'node:assert';

import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';

function makeLockedProject(): ProjectRecord {
  return {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status: 'confirmations_locked',
    workspace: {
      projectId: 'pptmaster-demo-project',
      workspacePath: 'projects/pptmaster-demo-project',
    },
    latestCheckpointId: 'pptmaster-demo-project-confirmations-locked-1751300100000',
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:15:00.000Z',
  };
}

function makeLockedCheckpoint(project: ProjectRecord): WorkflowCheckpoint {
  return {
    checkpointId: project.latestCheckpointId!,
    projectId: project.projectId,
    stage: 'confirmations_locked',
    status: 'completed',
    statusBefore: 'confirmations_generated',
    statusAfter: 'confirmations_locked',
    artifactIds: ['pptmaster-demo-project-confirmation-result'],
    note: 'Eight Confirmations have been locked.',
    createdAt: '2026-06-30T16:15:00.000Z',
  };
}

function makeConfirmationArtifacts(project: ProjectRecord): ProductArtifactRef[] {
  return [
    {
      artifactId: 'pptmaster-demo-project-confirmation-recommendations',
      projectId: project.projectId,
      kind: 'confirmation_recommendations',
      scope: 'project',
      status: 'ready',
      label: 'Confirmation recommendations',
      storageKey: `projects/${project.projectId}/confirmations/recommendations.json`,
      mimeType: 'application/json',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    {
      artifactId: 'pptmaster-demo-project-confirmation-result',
      projectId: project.projectId,
      kind: 'confirmation_result',
      scope: 'project',
      status: 'locked',
      label: 'Locked confirmation result',
      storageKey: `projects/${project.projectId}/confirmations/result.json`,
      mimeType: 'application/json',
      metadata: {
        answers: {
          audience: 'Founders',
          goal: 'Raise seed round',
          tone: 'Confident',
          language: 'zh-CN',
          brand: 'PPTMASTER',
          outline: 'problem-solution-traction',
          visual_style: 'minimal dark',
          delivery: 'live pitch',
        },
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
  ];
}

function main() {
  const project = makeLockedProject();
  const checkpoint = makeLockedCheckpoint(project);
  const recommendations = [
    { key: 'audience', title: 'Audience', recommendation: 'Founders and investors' },
    { key: 'goal', title: 'Goal', recommendation: 'Support seed fundraising' },
    { key: 'tone', title: 'Tone', recommendation: 'Confident and concise' },
    { key: 'language', title: 'Language', recommendation: 'zh-CN' },
    { key: 'brand', title: 'Brand', recommendation: 'Use PPTMASTER brand constraints' },
    { key: 'outline', title: 'Outline', recommendation: 'problem-solution-traction' },
    { key: 'visual_style', title: 'Visual Style', recommendation: 'minimal dark' },
    { key: 'delivery', title: 'Delivery', recommendation: 'live pitch' },
  ];
  const viewModel = toProjectViewModel(project, makeConfirmationArtifacts(project), recommendations, checkpoint);

  assert.equal(viewModel.status, 'confirmations_locked', 'view model should preserve confirmations_locked status');
  assert.equal(viewModel.timeline[0]?.key, 'sources', 'timeline should remain anchored at source intake');
  assert.equal(viewModel.timeline[1]?.key, 'confirmations', 'timeline should project the confirmation step');
  assert.equal(viewModel.timeline[1]?.status, 'confirmation_pending', 'confirmation step should retain its canonical lifecycle status after lock');
 assert.equal(viewModel.timeline[1]?.reached, true, 'confirmation step should be reached after lock');
  assert.equal(viewModel.timeline[2]?.key, 'strategist', 'timeline should continue to strategist after confirmations');
  assert.equal(viewModel.timeline[2]?.status, 'spec_ready', 'strategist should retain its canonical lifecycle status before spec artifacts exist');
 assert.equal(viewModel.timeline[2]?.reached, false, 'strategist should remain unreached before spec artifacts exist');
  assert.deepEqual(viewModel.nextActions, [], 'locked confirmations should not invent a generation action before strategist verification exists');
  assert.equal(viewModel.workbench.confirmationSubmission?.status, 'submitted', 'workbench should surface locked confirmation submission state');
  assert.match(viewModel.workbench.confirmationSubmission?.bannerText ?? '', /locked and ready/i, 'locked confirmations should advertise strategist handoff readiness');
  assert.equal(viewModel.workbench.confirmationSubmission?.completion.completedCount, 8, 'all eight confirmation answers should remain complete after reload');
  assert.equal(viewModel.latestCheckpoint?.checkpointId, project.latestCheckpointId, 'view model should expose the locked checkpoint id after refresh/reload reconstruction');
  assert.ok(viewModel.latestCheckpoint?.storageKey.endsWith(`${project.latestCheckpointId}.json`), 'view model should expose the locked checkpoint storage key after refresh/reload reconstruction');
  assert.equal(viewModel.latestCheckpoint?.stage, 'confirmations_locked', 'view model should expose the confirmation lock checkpoint stage');
  assert.equal(viewModel.latestCheckpoint?.createdAt, checkpoint.createdAt, 'view model should prefer persisted checkpoint timestamp for confirmations_locked recovery');

  console.log('confirmation-locked recovery slice test: ok');
}

main();
