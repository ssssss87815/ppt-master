import assert from 'node:assert/strict';

import { applyImportSources } from '../backend/actions/import-sources.ts';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations.ts';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations.ts';
import type {
  ImportSourcesAction,
  PrepareConfirmationsAction,
  SubmitConfirmationsAction,
} from '../backend/models/actions.ts';
import type { ProjectRecord } from '../backend/models/projects.ts';
import { toProjectViewModel } from '../backend/services/project-view-service.ts';
import { toProjectShellViewModel } from '../app/viewmodels/project-shell-view-model.ts';

function createPreparedView() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-shell-render-project',
    name: 'PPTMASTER Shell Render Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-shell-render-project',
      workspacePath: 'projects/pptmaster-shell-render-project',
    },
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:00:00.000Z',
  };

  const importAction: ImportSourcesAction = {
    type: 'import_sources',
    payload: {
      projectId: project.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  };
  const imported = applyImportSources(project, importAction, '2026-06-30T16:05:00.000Z');

  const prepareAction: PrepareConfirmationsAction = {
    type: 'prepare_confirmations',
    payload: { projectId: project.projectId },
  };
  const prepared = applyPrepareConfirmations(imported.project, imported.artifacts, prepareAction, '2026-06-30T16:10:00.000Z');
  const preparedArtifacts = [...imported.artifacts, prepared.artifact];

  return {
    projectId: project.projectId,
    recommendations: prepared.recommendations,
    view: toProjectViewModel(prepared.project, preparedArtifacts, prepared.recommendations, prepared.checkpoint),
  };
}

function main() {
  const prepared = createPreparedView();
  const readyShellView = toProjectShellViewModel(prepared.view);

  assert.equal(readyShellView.projectId, prepared.projectId);
  assert.equal(readyShellView.confirmationSection.title, 'Confirmation status');
  assert.equal(readyShellView.confirmationSection.summary, '8 recommendations are ready for user review.');
  assert.deepEqual(
    readyShellView.confirmationSection.submission,
    prepared.view.workbench.confirmationSubmission && prepared.view.workbench.confirmationSubmission.status !== 'not_ready'
    ? {
        ...prepared.view.workbench.confirmationSubmission,
        completionLabel: '0/8 answered',
        questions: prepared.view.workbench.confirmationSubmission.questions.map((question) => ({
          ...question,
          placeholder: question.input.placeholder,
        })),
      }
    : undefined);
  assert.equal(readyShellView.confirmationSection.submission?.status, 'ready');

  assert.equal(readyShellView.confirmationSection.submission?.completion.totalCount, 8);
  assert.equal(readyShellView.confirmationSection.submission?.completionLabel, '0/8 answered');
  assert.equal(readyShellView.confirmationSection.submission?.questions.every((item) => item.isAnswered === false), true);
  assert.equal(
    readyShellView.confirmationSection.submission?.questions.find((item) => item.key === 'outline')?.recommendation,
    prepared.view.workbench.confirmationSubmission?.questions.find((item) => item.key === 'outline')?.recommendation,
  );

  const submitAction: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: prepared.projectId,
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
  };

  const projectRecord: ProjectRecord = {
    projectId: prepared.projectId,
    name: 'PPTMASTER Shell Render Project',
    status: 'confirmation_pending',
    workspace: {
      projectId: prepared.projectId,
      workspacePath: 'projects/pptmaster-shell-render-project',
    },
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:10:00.000Z',
  };

  const imported = applyImportSources(projectRecord, {
    type: 'import_sources',
    payload: {
      projectId: prepared.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  }, '2026-06-30T16:05:00.000Z');
  const preparedState = applyPrepareConfirmations(imported.project, imported.artifacts, {
    type: 'prepare_confirmations',
    payload: { projectId: prepared.projectId },
  }, '2026-06-30T16:10:00.000Z');
  const submitted = applySubmitConfirmations(preparedState.project, submitAction, '2026-06-30T16:15:00.000Z');
  const submittedView = toProjectViewModel(
    submitted.project,
    [...imported.artifacts, preparedState.artifact, ...submitted.artifacts],
    preparedState.recommendations,
    submitted.checkpoint,
  );
  const submittedShellView = toProjectShellViewModel(submittedView);

  assert.match(submittedShellView.confirmationSection.submission?.bannerText ?? '', /locked and ready/i);
  assert.equal(submittedShellView.confirmationSection.submission?.status, 'submitted');
  assert.equal(submittedShellView.confirmationSection.submission?.completion.completedCount, 8);
  assert.equal(submittedShellView.confirmationSection.submission?.completion.totalCount, 8);
  assert.equal(submittedShellView.confirmationSection.submission?.completionLabel, '8/8 answered');
  assert.equal(submittedShellView.confirmationSection.submission?.questions.every((item) => item.isAnswered), true);
  assert.equal(
    submittedShellView.confirmationSection.submission?.questions.find((item) => item.key === 'goal')?.answer,
    'Raise seed round',
  );

  console.log('project shell confirmation submission render test: ok');
}

main();
