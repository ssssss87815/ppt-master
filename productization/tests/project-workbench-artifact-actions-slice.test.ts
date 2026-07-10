import assert from 'node:assert/strict';

import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';
import type { ProjectViewModel } from '../app/viewmodels/project-view-model.ts';

const project: ProjectViewModel = {
  projectId: 'artifact-actions-project',
  name: 'Artifact actions project',
  status: 'export_ready',
  currentPhase: { status: 'export_ready', title: 'Export ready' },
  timeline: [],
  nextActions: [],
  preview: {
    latestPreviewUrl: '/projects/artifact-actions-project/preview/index.html?revision=2&mode=review',
    manifestStorageKey: 'projects/artifact-actions-project/preview/index.json',
    pageCount: 1,
  },
  export: {
    latestExportUrl: '/projects/artifact-actions-project/exports/final.pptx?download=1&revision=2',
    latestExportLabel: 'Final PPTX',
    format: 'pptx',
    filename: 'final.pptx',
  },
  workbench: {
    sections: [],
    confirmationState: { recommendationCount: 0, answeredCount: 0, locked: true, displayStatus: 'completed' },
    summaryCards: [],
  },
  sources: [],
  confirmations: [],
  artifacts: [],
  lastUpdatedAt: '2026-07-10T07:00:00.000Z',
};

const body = renderProjectWorkbenchShell(project);

assert.match(body, /<a class="artifact-link" href="\/projects\/artifact-actions-project\/preview\/index.html\?revision=2&amp;mode=review" data-preview-action="open">Open live preview<\/a>/);
assert.match(body, /<a class="artifact-link" href="\/projects\/artifact-actions-project\/exports\/final.pptx\?download=1&amp;revision=2" data-export-action="download">Download PPTX<\/a>/);
assert.doesNotMatch(body, /href="\/projects\/artifact-actions-project\/preview\/index.html\?revision=2&mode=review"/, 'action URLs must remain HTML escaped');

const withoutExportUrl = renderProjectWorkbenchShell({
  ...project,
  export: {
    ...project.export!,
    latestExportUrl: undefined,
  },
});

assert.doesNotMatch(withoutExportUrl, /data-export-action="download"/, 'the workbench must not advertise a download when the projection has no verified export URL');
assert.match(withoutExportUrl, /<span class="panel-status">pending<\/span>/, 'an unlinked export should remain honestly pending');

console.log('project workbench artifact actions slice test: ok');
