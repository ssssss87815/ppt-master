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
      gateStatus: 'pending_runtime_verification',
      summary: 'Design spec and spec lock exist, but runtime bridge verification is still pending.',
      detail: 'Keep generation blocked until both strategist handoff artifacts clear runtime verification. The product shell should not treat file presence alone as enough proof.',
      panelStatus: 'warning',
      verificationBadgeTone: 'warning',
      verificationBadgeText: 'Pending runtime bridge verification',
      gateLabel: 'Verification pending',
      verifiedArtifactCount: 0,
      pendingArtifactCount: 2,
      generationGateCopy: 'Generation handoff locked: wait for runtime bridge verification before starting page generation.',
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
  /<p class="action-availability">Generation handoff locked: wait for runtime bridge verification before starting page generation\.<\/p>/,
  'start_generation should explain the runtime strategist gate instead of implying a generic unavailable action',
);
assert.match(
  html,
  /<p class="action-availability">Runtime action unavailable in this read-only workbench\.<\/p>/,
  'other unsupported projected actions should remain honest instead of presenting a dead control',
);

console.log('project workbench next-action UI test: ok');
