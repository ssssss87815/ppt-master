type Assert = (condition: boolean, message: string) => void;

import { applyImportSources } from '../backend/actions/import-sources';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations';
import type {
  ImportSourcesAction,
  PrepareConfirmationsAction,
  SubmitConfirmationsAction,
} from '../backend/models/actions';
import type { ConfirmationAnswerMap } from '../backend/models/confirmations';
import type { ProjectRecord } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function main() {
  const baseProject: ProjectRecord = {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-demo-project',
      workspacePath: 'projects/pptmaster-demo-project',
    },
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:00:00.000Z',
  };

  const importAction: ImportSourcesAction = {
    type: 'import_sources',
    payload: {
      projectId: baseProject.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  };

  const imported = applyImportSources(baseProject, importAction, '2026-06-30T16:05:00.000Z');
  assert(imported.project.status === 'sources_ready', 'import should move sources_ready');
  assert(
    imported.artifacts.filter((item) => item.kind !== 'workflow_checkpoint').length === 2,
    'import should create source artifacts',
  );

  const prepareAction: PrepareConfirmationsAction = {
    type: 'prepare_confirmations',
    payload: { projectId: baseProject.projectId },
  };

  const prepared = applyPrepareConfirmations(
    imported.project,
    imported.artifacts,
    prepareAction,
    '2026-06-30T16:10:00.000Z',
  );
  assert(prepared.project.status === 'confirmation_pending', 'prepare should move confirmation_pending');
  assert(prepared.recommendations.length === 8, 'prepare should create eight recommendations');
  assert(prepared.artifact.kind === 'confirmation_recommendations', 'prepare should create recommendation artifact');

  const answers: ConfirmationAnswerMap = {
    audience: 'Founders preparing an investor pitch.',
    goal: 'Secure interest for a follow-up partner meeting.',
    tone: 'Crisp and confident.',
    language: 'zh-CN',
    brand: 'PPTMASTER',
    outline: 'problem-solution-traction',
    visual_style: 'minimal dark editorial',
    delivery: 'live pitch',
  };

  const submitAction: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: baseProject.projectId,
      answers,
    },
  };

  const submitted = applySubmitConfirmations(
    prepared.project,
    submitAction,
    '2026-06-30T16:15:00.000Z',
  );
  assert(submitted.project.status === 'confirmation_locked', 'submit should remain confirmation_locked until strategist runtime verification succeeds');
  assert(submitted.checkpoint.statusAfter === 'confirmation_locked', 'submit checkpoint should stay confirmation_locked when strategist artifacts are unverified');
  assert(
    submitted.artifacts.some((item) => item.kind === 'confirmation_result'),
    'submit should emit confirmation_result artifact',
  );
  assert(
    submitted.artifacts.some((item) => item.storageKey.endsWith('/confirmations/result.json')),
    'submit should emit repo-compatible confirmation result path',
  );
  assert(
    submitted.artifacts.some((item) => item.kind === 'design_spec'),
    'submit should emit design_spec artifact',
  );
  assert(
    submitted.artifacts.some((item) => item.kind === 'spec_lock'),
    'submit should emit spec_lock artifact',
  );

  const viewModel = toProjectViewModel(
    submitted.project,
    [...imported.artifacts, prepared.artifact, ...submitted.artifacts],
    prepared.recommendations,
    submitted.checkpoint,
  );

  assert(viewModel.status === 'confirmation_locked', 'view model should surface the truthful confirmation_locked status');
  assert(viewModel.timeline[0]?.key === 'sources', 'timeline should begin with source intake');
  assert(viewModel.timeline[1]?.key === 'confirmations', 'timeline should expose confirmation lock stage second');
  assert(viewModel.timeline[2]?.key === 'strategist', 'timeline should expose strategist handoff stage');
  assert(viewModel.timeline[2]?.description.length > 0, 'timeline should surface product-visible strategist descriptions');
  assert(
    viewModel.latestCheckpoint?.storageKey?.endsWith(`${submitted.project.latestCheckpointId}.json`),
    'latest checkpoint should point at checkpoint artifact storage',
  );
  assert(viewModel.nextActions.length === 0, 'spec_ready should not expose generation until strategist runtime is verified');
  assert(viewModel.sources[0]?.label === 'Seed memo', 'view model should surface imported source label first');
  assert(viewModel.confirmations[0]?.key === 'audience', 'view model should surface first recommendation key');
  assert(viewModel.confirmations[0]?.title === 'Audience', 'view model should surface human-readable confirmation title');
  assert(
    typeof viewModel.confirmations[0]?.recommendation === 'string' &&
      viewModel.confirmations[0]?.recommendation.includes('target audience'),
    'view model should surface recommendation text for confirmation questions',
  );
  assert(viewModel.artifacts.some((item) => item.kind === 'spec_lock'), 'view model should expose spec_lock in artifact list');
  assert(viewModel.lastUpdatedAt === submitted.project.updatedAt, 'view model should surface project lastUpdatedAt');
  assert(
    viewModel.latestCheckpoint?.checkpointId === submitted.project.latestCheckpointId,
    'view model should surface latest checkpoint metadata',
  );
  assert(
    viewModel.latestCheckpoint?.stage === 'confirmations_locked',
    'view model should surface latest checkpoint stage',
  );
  assert(
    viewModel.latestCheckpoint?.statusTitle === 'Completed',
    'view model should surface human-readable latest checkpoint status title',
  );
  assert(
    viewModel.latestCheckpoint?.stageTitle === 'Confirmations Locked',
    'view model should surface latest checkpoint stage title',
  );
  assert(
    viewModel.latestCheckpoint?.status === 'completed',
    'view model should surface latest checkpoint status',
  );

  console.log('slice-1 happy path test: ok');
}

main();
