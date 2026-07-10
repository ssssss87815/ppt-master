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
    projectId: 'pptmaster-gating-project',
    name: 'PPTMASTER Gating Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-gating-project',
      workspacePath: 'projects/pptmaster-gating-project',
    },
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  };

  const importAction: ImportSourcesAction = {
    type: 'import_sources',
    payload: {
      projectId: baseProject.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  };

  const imported = applyImportSources(baseProject, importAction, '2026-07-08T00:05:00.000Z');

  const prepareAction: PrepareConfirmationsAction = {
    type: 'prepare_confirmations',
    payload: { projectId: baseProject.projectId },
  };

  const prepared = applyPrepareConfirmations(
    imported.project,
    imported.artifacts,
    prepareAction,
    '2026-07-08T00:10:00.000Z',
  );

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
    '2026-07-08T00:15:00.000Z',
  );

  const viewModel = toProjectViewModel(
    submitted.project,
    [...imported.artifacts, prepared.artifact, ...submitted.artifacts],
    prepared.recommendations,
    submitted.checkpoint,
  );

  assert(viewModel.status === 'confirmation_locked', 'view model should surface confirmation_locked while strategist runtime verification is still missing');
  assert(viewModel.nextActions.length === 0, 'confirmation_locked should not expose generation actions while strategist bridge is unverified');
  assert(
    viewModel.workbench.summaryCards.some(
      (card) => card.key === 'strategist' && card.tone === 'warning' && card.value.includes('Pending runtime verification'),
    ),
    'summary cards should show strategist runtime verification is still pending',
  );

  const strategistSection = viewModel.workbench.sections.find((section) => section.key === 'strategist');
  assert(Boolean(strategistSection), 'strategist section should exist');
  assert(strategistSection?.status === 'warning', 'strategist section should warn and remain blocked while runtime verification is missing');
  assert(
    strategistSection?.summary.includes('runtime verification'),
    'strategist section summary should explain the runtime verification gate',
  );
  assert(strategistSection?.action === undefined, 'strategist section should not expose a premature generation action while gated');
  assert(
    strategistSection?.badges?.some((badge) => badge.text.includes('Unverified runtime output')) ?? false,
    'strategist section badge should surface strategist verification gating',
  );

  console.log('spec-ready generation gating test: ok');
}

main();
