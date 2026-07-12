import { strict as assert } from 'node:assert';

import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { toProjectViewModel } from '../backend/services/project-view-service.ts';

const now = '2026-07-11T09:00:00.000Z';

function project(status: ProjectRecord['status'] = 'generation_in_progress'): ProjectRecord {
  return {
    projectId: 'runtime-availability-gate',
    name: 'Runtime availability gate',
    status,
    workspace: {
      projectId: 'runtime-availability-gate',
      workspacePath: 'projects/runtime-availability-gate',
    },
    lastRunId: 'current-run',
    createdAt: now,
    updatedAt: now,
  };
}

function artifact(
  kind: ProductArtifactRef['kind'],
  overrides: Partial<ProductArtifactRef> = {},
): ProductArtifactRef {
  return {
    artifactId: `${kind}-${overrides.status ?? 'ready'}-${overrides.runId ?? 'current-run'}`,
    projectId: 'runtime-availability-gate',
    kind,
    scope: kind === 'preview_page_svg' ? 'page' : 'run',
    status: 'ready',
    label: kind,
    runId: 'current-run',
    storageKey: `projects/runtime-availability-gate/${kind}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function checkpoint(
  stage: WorkflowCheckpoint['stage'],
  status: WorkflowCheckpoint['status'],
  artifactIds: string[],
  overrides: Partial<WorkflowCheckpoint> = {},
): WorkflowCheckpoint {
  return {
    checkpointId: `${stage}-${status}`,
    projectId: 'runtime-availability-gate',
    stage,
    status,
    statusBefore: 'generation_in_progress',
    statusAfter: stage === 'preview_synced' ? 'preview_available' : 'export_ready',
    artifactIds,
    createdAt: now,
    ...overrides,
  };
}

function assertUnavailable(
  description: string,
  status: ProjectRecord['status'],
  artifacts: ProductArtifactRef[],
  latestCheckpoint?: WorkflowCheckpoint,
): void {
  const view = toProjectViewModel(project(status), artifacts, [], latestCheckpoint);
  assert.equal(view.preview, undefined, `${description}: preview must not be exposed`);
  assert.equal(view.export, undefined, `${description}: export must not be exposed`);
  assert.equal(view.latestPreviewUrl, undefined, `${description}: preview URL must not be exposed`);
  assert.equal(view.latestExportUrl, undefined, `${description}: export URL must not be exposed`);
  assert.equal(view.nextActions.includes('export_pptx'), false, `${description}: export action must remain unavailable`);
}

function main() {
  const previewBundle = artifact('preview_bundle');
  const previewPage = artifact('preview_page_svg', { pageKey: 'page-1' });
  const exportPptx = artifact('export_pptx');

  assertUnavailable(
    'failed runtime artifacts',
    'preview_available',
    [artifact('preview_bundle', { status: 'failed' }), artifact('preview_page_svg', { status: 'failed', pageKey: 'page-1' }), artifact('export_pptx', { status: 'failed' })],
    checkpoint('preview_synced', 'failed', [previewBundle.artifactId, previewPage.artifactId]),
  );
  assertUnavailable(
    'pending runtime artifacts',
    'preview_available',
    [artifact('preview_bundle', { status: 'pending' }), artifact('preview_page_svg', { status: 'pending', pageKey: 'page-1' }), artifact('export_pptx', { status: 'pending' })],
    checkpoint('preview_synced', 'started', [previewBundle.artifactId, previewPage.artifactId]),
  );
  assertUnavailable(
    'planned runtime artifacts',
    'preview_available',
    [artifact('preview_bundle', { status: 'planned' }), artifact('preview_page_svg', { status: 'planned', pageKey: 'page-1' }), artifact('export_pptx', { status: 'planned' })],
    checkpoint('preview_synced', 'started', [previewBundle.artifactId, previewPage.artifactId]),
  );
  assertUnavailable(
    'superseded runtime artifacts',
    'preview_available',
    [artifact('preview_bundle', { status: 'superseded' }), artifact('preview_page_svg', { status: 'superseded', pageKey: 'page-1' }), artifact('export_pptx', { status: 'superseded' })],
    checkpoint('preview_synced', 'completed', [previewBundle.artifactId, previewPage.artifactId]),
  );
  assertUnavailable(
    'cross-run artifacts',
    'preview_available',
    [artifact('preview_bundle', { runId: 'previous-run' }), artifact('preview_page_svg', { runId: 'previous-run', pageKey: 'page-1' }), artifact('export_pptx', { runId: 'previous-run' })],
    checkpoint('preview_synced', 'completed', [previewBundle.artifactId, previewPage.artifactId]),
  );
  assertUnavailable(
    'missing successful preview checkpoint',
    'preview_available',
    [previewBundle, previewPage, exportPptx],
    checkpoint('generation_started', 'completed', []),
  );
  assertUnavailable(
    'preview checkpoint with unrelated artifacts',
    'preview_available',
    [previewBundle, previewPage, exportPptx],
    checkpoint('preview_synced', 'completed', ['unrelated-artifact']),
  );

  const previewCheckpoint = checkpoint('preview_synced', 'completed', [previewBundle.artifactId, previewPage.artifactId]);
  const previewView = toProjectViewModel(project('preview_available'), [previewBundle, previewPage], [], previewCheckpoint);
  assert.equal(previewView.preview?.pageCount, 1, 'completed runtime preview checkpoint should expose current-run preview artifacts');
  assert.equal(previewView.nextActions.includes('export_pptx'), true, 'completed runtime preview checkpoint should expose the adjacent export action');

  const newerUnrelatedCheckpoint = checkpoint('generation_started', 'completed', [], {
    checkpointId: 'newer-unrelated-checkpoint',
    createdAt: '2026-07-11T10:00:00.000Z',
  });
  const previewWithNewerCheckpoint = toProjectViewModel(
    project('preview_available'),
    [previewBundle, previewPage],
    [],
    newerUnrelatedCheckpoint,
    undefined,
    [previewCheckpoint, newerUnrelatedCheckpoint],
  );
  assert.equal(
    previewWithNewerCheckpoint.preview?.pageCount,
    1,
    'a newer unrelated checkpoint must not hide completed current-run preview evidence',
  );
  assert.equal(
    previewWithNewerCheckpoint.nextActions.includes('export_pptx'),
    true,
    'a newer unrelated checkpoint must not hide the export action backed by current-run preview evidence',
  );

  const exportCheckpoint = checkpoint('export_ready', 'completed', [exportPptx.artifactId], {
    statusBefore: 'preview_available',
    statusAfter: 'export_ready',
  });
  const exportView = toProjectViewModel(project('export_ready'), [previewBundle, previewPage, exportPptx], [], exportCheckpoint);
  assert.equal(exportView.export?.latestExportUrl, '/projects/runtime-availability-gate/export_pptx', 'completed runtime export checkpoint should expose the current-run PPTX artifact');

  const exportWithNewerCheckpoint = toProjectViewModel(
    project('export_ready'),
    [previewBundle, previewPage, exportPptx],
    [],
    newerUnrelatedCheckpoint,
    undefined,
    [previewCheckpoint, exportCheckpoint, newerUnrelatedCheckpoint],
  );
  assert.equal(
    exportWithNewerCheckpoint.export?.latestExportUrl,
    '/projects/runtime-availability-gate/export_pptx',
    'a newer unrelated checkpoint must not hide completed current-run export evidence',
  );

  console.log('workbench runtime availability gate test: ok');
}

main();
