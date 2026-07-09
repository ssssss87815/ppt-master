import assert from 'node:assert/strict';

import { applyImportSources } from '../backend/actions/import-sources.ts';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations.ts';
import type { ImportSourcesAction, PrepareConfirmationsAction } from '../backend/models/actions.ts';
import type { ProjectRecord } from '../backend/models/projects.ts';
import { toProjectViewModel } from '../backend/services/project-view-service.ts';
import { toProjectShellViewModel } from '../app/viewmodels/project-shell-view-model.ts';

function main() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-shell-confirm-ui-project',
    name: 'PPTMASTER Shell Confirmation UI Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-shell-confirm-ui-project',
      workspacePath: 'projects/pptmaster-shell-confirm-ui-project',
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

  const view = toProjectViewModel(prepared.project, preparedArtifacts, prepared.recommendations, prepared.checkpoint);

  assert.ok(view.workbench.confirmationSubmission, 'workbench should expose confirmation submission view model');
  assert.equal(view.workbench.confirmationSubmission?.projectId, project.projectId);
  assert.equal(view.workbench.confirmationSubmission?.status, 'ready');
  assert.equal(view.workbench.confirmationSubmission?.questions.length, 8);
  assert.equal(view.workbench.confirmationSubmission?.completion.completedCount, 0);
  assert.equal(view.workbench.confirmationSubmission?.completion.totalCount, 8);
  assert.equal(view.workbench.confirmationSubmission?.submitAction.type, 'submit_confirmations');
  assert.equal(view.workbench.confirmationSubmission?.submitAction.projectId, project.projectId);
  assert.equal(
    view.workbench.sections.find((item) => item.key === 'confirmations')?.action,
    view.workbench.confirmationSubmission?.submitAction.type,
    'confirmation section action should align with the embedded confirmation submission CTA',
  );
  assert.equal(view.workbench.confirmationSubmission?.questions.find((item) => item.key === 'audience')?.answer, '');
  assert.match(view.workbench.confirmationSubmission?.bannerText ?? '', /8 confirmation answers/i);

  const shellView = toProjectShellViewModel(view);

  assert.equal(shellView.confirmationSection.key, 'confirmations');
  assert.equal(shellView.confirmationSection.status, 'current');
  assert.equal(shellView.confirmationSection.submission?.projectId, project.projectId);
  assert.equal(shellView.confirmationSection.submission?.status, 'ready');
  assert.equal(shellView.confirmationSection.submission?.submitAction.type, 'submit_confirmations');
  assert.match(shellView.confirmationSection.submission?.bannerText ?? '', /8 confirmation answers/i);
  assert.equal(shellView.confirmationSection.submission?.completion.completedCount, 0);
  assert.equal(shellView.confirmationSection.submission?.completion.totalCount, 8);
  assert.equal(shellView.confirmationSection.submission?.completionLabel, '0/8 answered');
  assert.equal(shellView.confirmationSection.submission?.questions.length, 8);
  assert.equal(shellView.confirmationSection.submission?.questions.find((item) => item.key === 'audience')?.placeholder, 'Who is the primary audience for this deck?');
  assert.equal(shellView.confirmationSection.submission?.questions.find((item) => item.key === 'audience')?.answer, '');

  console.log('project workbench shell confirmation submission integration test: ok');
}

main();
