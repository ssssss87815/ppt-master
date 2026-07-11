import assert from 'node:assert/strict';

import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';
import type { ProjectViewModel } from '../app/viewmodels/project-view-model.ts';

const project = {
  projectId: 'next-action-ui-project',
  name: 'Next action UI project',
  status: 'spec_ready',
  currentPhase: {
    status: 'spec_ready',
    title: 'Strategist runtime verification',
  },
  nextActions: ['submit_confirmations', 'start_generation', 'export_pptx'],
  timeline: [],
  sources: [],
  confirmations: [],
  artifacts: [],
  lastUpdatedAt: '2026-07-10T12:00:00.000Z',
  workbench: {
    strategistHandoff: {
      gateStatus: 'verified',
      summary: 'Design spec and spec lock are runtime-verified and ready for generation.',
      detail: 'Generation may start from the locked strategist handoff.',
      panelStatus: 'complete',
      verificationBadgeTone: 'success',
      verificationBadgeText: 'Runtime bridge verified',
      gateLabel: 'Verified',
      verifiedArtifactCount: 2,
      pendingArtifactCount: 0,
      generationGateCopy: 'Generation handoff verified and ready to start page generation.',
      artifacts: [],
    },
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
  /<button type="button" class="next-action-button" data-action-code="start_generation" data-project-id="next-action-ui-project">Start Generation<\/button>|<button type="button" class="next-action-button" data-action-code="start_generation" data-project-id="next-action-ui-project">Start generation<\/button>/,
  'verified start_generation should expose an explicit, project-scoped control',
);
assert.doesNotMatch(
  html,
  /<p class="action-availability">Generation handoff locked: wait for runtime bridge verification before starting page generation\.<\/p>/,
  'verified start_generation should stop rendering the old unavailable copy',
);
assert.match(
  html,
  /<p class="action-availability">Runtime action unavailable in this read-only workbench\.<\/p>/,
  'other unsupported projected actions should remain honest instead of presenting a dead control',
);

console.log('project workbench next-action UI test: ok');
