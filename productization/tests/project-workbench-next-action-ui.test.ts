import assert from 'node:assert/strict';

import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';
import type { ProjectViewModel } from '../app/viewmodels/project-view-model.ts';

const project = {
  projectId: 'next-action-ui-project',
  name: 'Next action UI project',
  status: 'confirmation_pending',
  currentPhase: {
    status: 'confirmation_pending',
    title: 'Confirmations ready',
  },
  nextActions: ['submit_confirmations', 'start_generation'],
  timeline: [],
  sources: [],
  confirmations: [],
  artifacts: [],
  lastUpdatedAt: '2026-07-10T12:00:00.000Z',
  workbench: {
    confirmationState: {
      recommendationCount: 0,
      answeredCount: 0,
      locked: false,
      displayStatus: 'ready_for_review',
    },
    sections: [],
    summaryCards: [],
  },
} satisfies ProjectViewModel;

const html = renderProjectWorkbenchShell(project);

assert.match(
  html,
  /<button type="button" class="next-action-button" data-action-code="submit_confirmations" data-project-id="next-action-ui-project">Submit Confirmations<\/button>/,
  'the supported confirmation action should expose an explicit, project-scoped control',
);
assert.match(
  html,
  /<p class="action-availability">Runtime action unavailable in this read-only workbench.<\/p>/,
  'unsupported projected actions should remain honest instead of presenting a dead control',
);

console.log('project workbench next-action UI test: ok');
