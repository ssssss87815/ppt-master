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

function main() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-confirm-ui-project',
    name: 'PPTMASTER Confirmation UI Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-confirm-ui-project',
      workspacePath: 'projects/pptmaster-confirm-ui-project',
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
  const readyView = toProjectViewModel(prepared.project, preparedArtifacts, prepared.recommendations, prepared.checkpoint).workbench.confirmationSubmission;

  assert.ok(readyView, 'ready confirmation submission view should exist after preparation');
  assert.equal(readyView?.projectId, project.projectId);
  assert.equal(readyView?.status, 'ready');
  assert.equal(readyView?.submitAction?.type, 'submit_confirmations');
  assert.equal(readyView?.submitAction?.projectId, project.projectId);
  assert.equal(readyView?.questions.length, 8);
  assert.equal(readyView?.completion.completedCount, 0);
  assert.equal(readyView?.completion.totalCount, 8);
  assert.match(readyView?.bannerText ?? '', /8 confirmation answers/i);

  const audienceQuestion = readyView?.questions.find((item) => item.key === 'audience');
  assert.ok(audienceQuestion, 'audience question should exist');
  assert.equal(audienceQuestion?.input.placeholder, 'Who is the primary audience for this deck?');
  assert.match(audienceQuestion?.recommendation ?? '', /target audience/i);
  assert.equal(audienceQuestion?.answer, '');
  assert.equal(audienceQuestion?.isAnswered, false);

  const outlineQuestion = readyView?.questions.find((item) => item.key === 'outline');
  assert.ok(outlineQuestion, 'outline question should exist');
  assert.match(outlineQuestion?.recommendation ?? '', /narrative arc/i);

  const submitAction: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: project.projectId,
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
  const submitted = applySubmitConfirmations(prepared.project, submitAction, '2026-06-30T16:15:00.000Z');
  const submittedArtifacts = [...preparedArtifacts, ...submitted.artifacts];
  const submittedView = toProjectViewModel(submitted.project, submittedArtifacts, prepared.recommendations, submitted.checkpoint).workbench.confirmationSubmission;

  assert.ok(submittedView, 'submitted confirmation submission view should still exist after locking');
  assert.equal(submittedView?.status, 'submitted');
  assert.match(submittedView?.bannerText ?? '', /locked and ready/i);
  assert.equal(submittedView?.completion.completedCount, 8);
  assert.equal(submittedView?.completion.totalCount, 8);
  assert.equal(submittedView?.questions.every((item) => item.isAnswered), true);
  assert.equal(submittedView?.questions.find((item) => item.key === 'audience')?.answer, 'Founders');

  console.log('project workbench confirmation submission ui test: ok');
}

main();
