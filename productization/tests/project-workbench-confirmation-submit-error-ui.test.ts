import assert from 'node:assert/strict';

import type { ProjectViewModel } from '../app/viewmodels/project-view-model.ts';
import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';

const project = {
  projectId: 'confirmation-error-ui',
  name: 'Confirmation error UI',
  status: 'created',
  workspacePath: 'projects/confirmation-error-ui',
  currentPhase: {
    key: 'confirmations',
    title: 'Confirmations',
    status: 'current',
  },
  nextActions: ['submit_confirmations'],
  sources: [],
  artifacts: [],
  timeline: [],
  workbench: {
    summaryCards: [],
    sections: [],
    timeline: [],
    confirmationSubmission: {
      projectId: 'confirmation-error-ui',
      status: 'pending',
      bannerTone: 'warning',
      bannerText: 'Answer all confirmation prompts before submission.',
      completion: {
        completedCount: 0,
        totalCount: 1,
        isComplete: false,
      },
      submitAction: {
        type: 'submit_confirmations',
        projectId: 'confirmation-error-ui',
      },
      questions: [
        {
          key: 'audience',
          title: 'Audience',
          input: {
            kind: 'textarea',
            placeholder: 'Who is this deck for?',
          },
        },
      ],
    },
  },
} as unknown as ProjectViewModel;

const html = renderProjectWorkbenchShell(project);

assert.match(html, /class="confirmation-submit-error" role="alert" hidden/, 'the browser-visible form should reserve an accessible submission error target');
assert.match(html, /if\(!response\.ok\)/, 'the client shell should preserve the form when the POST response is not successful');
assert.match(html, /Could not submit confirmation answers:/, 'the client shell should surface a retryable failure explanation');
assert.match(html, /button\.disabled=true/, 'the client shell should prevent duplicate submissions while the request is in flight');
assert.match(html, /syncCompletion\(\)/, 'the client shell should recompute readiness after a failed request');
assert.match(html, /button\.disabled=!isComplete/, 'the client shell should restore the retry path only when all answers remain complete');

console.log('project workbench confirmation submit error UI test: ok');
