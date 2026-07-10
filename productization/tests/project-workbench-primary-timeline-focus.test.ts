import assert from 'node:assert/strict';

import type { ProjectViewModel } from '../app/viewmodels/project-view-model.ts';
import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';

const project = {
  projectId: 'timeline-strategist-focus',
  name: 'Timeline strategist focus',
  status: 'generation_ready',
  workspacePath: 'projects/timeline-strategist-focus',
  currentPhase: {
    key: 'strategist',
    title: 'Strategist handoff',
    status: 'current',
  },
  nextActions: [],
  sources: [],
  artifacts: [
    {
      artifactId: 'design-spec',
      kind: 'design_spec',
      status: 'ready',
      label: 'Design specification',
    },
  ],
  workbench: {
    summaryCards: [],
    sections: [],
    timeline: [
      {
        key: 'strategist',
        title: 'Strategist handoff',
        status: 'current',
        isCurrent: true,
        reached: true,
      },
    ],
    currentTimelineItem: {
      key: 'strategist',
      title: 'Strategist handoff',
      status: 'current',
      isCurrent: true,
      reached: true,
    },
  },
  timeline: [],
  export: {
    latestExportUrl: '/exports/timeline-strategist-focus.pptx',
    latestExportLabel: 'Timeline strategist focus.pptx',
    filename: 'timeline-strategist-focus.pptx',
    format: 'pptx',
    artifactCount: 1,
    companionCount: 0,
  },
} as ProjectViewModel;

const html = renderProjectWorkbenchShell(project);

assert.match(html, /data-target="strategist" data-primary-panel="true"/, 'a current strategist timeline item should remain the primary panel when an older export is also available');
assert.match(html, /<a class="skip-link" href="#panel-strategist">Skip to primary workbench panel<\/a>/, 'keyboard skip navigation should follow the current strategist timeline item');
assert.match(html, /data-target="export" data-primary-panel="false"/, 'the historical export should stay visible without stealing primary focus');

console.log('project workbench primary timeline focus test: ok');
