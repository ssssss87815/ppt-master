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
  assert.equal(previewView.qualityCheck?.status, 'ready_to_run', 'completed runtime preview checkpoint should require Quality Check before export');
  assert.deepEqual(previewView.nextActions, ['run_quality_check'], 'completed runtime preview checkpoint should surface Quality Check as the only next action');

  const duplicatePreviewBundle = artifact('preview_bundle', {
    artifactId: 'duplicate-preview-bundle',
    storageKey: 'projects/runtime-availability-gate/preview/duplicate-index.json',
    createdAt: '2026-07-11T10:00:00.000Z',
  });
  const duplicatePreviewPage = artifact('preview_page_svg', {
    artifactId: 'duplicate-preview-page',
    pageKey: 'page-1',
    storageKey: 'projects/runtime-availability-gate/svg_output/duplicate-page-1.svg',
    createdAt: '2026-07-11T10:00:00.000Z',
  });
  const previewWithDuplicateArtifacts = toProjectViewModel(
    project('preview_available'),
    [previewBundle, previewPage, duplicatePreviewBundle, duplicatePreviewPage],
    [],
    previewCheckpoint,
  );
  assert.equal(
    previewWithDuplicateArtifacts.preview?.latestPreviewUrl,
    '/projects/runtime-availability-gate/preview_bundle',
    'completed preview checkpoint must select its own bundle rather than a newer duplicate artifact',
  );
  assert.deepEqual(
    previewWithDuplicateArtifacts.preview?.items?.map((item) => item.artifactId),
    [previewBundle.artifactId, previewPage.artifactId],
    'completed preview checkpoint must expose only the artifacts it attests',
  );

  assertUnavailable(
    'duplicate preview artifact identity in a completed checkpoint',
    'preview_available',
    [
      previewBundle,
      previewPage,
      artifact('preview_page_svg', {
        artifactId: previewPage.artifactId,
        pageKey: 'page-1',
        storageKey: 'projects/runtime-availability-gate/svg_output/duplicate-identity-page-1.svg',
      }),
    ],
    previewCheckpoint,
  );

  assertUnavailable(
    'duplicate preview artifact reference in a completed checkpoint',
    'preview_available',
    [previewBundle, previewPage],
    checkpoint('preview_synced', 'completed', [previewBundle.artifactId, previewPage.artifactId, previewPage.artifactId]),
  );

  assertUnavailable(
    'distinct preview artifacts with the same page key in a completed checkpoint',
    'preview_available',
    [
      previewBundle,
      previewPage,
      artifact('preview_page_svg', {
        artifactId: 'same-page-key-preview-page',
        pageKey: previewPage.pageKey,
        storageKey: 'projects/runtime-availability-gate/svg_output/same-page-key-page-1.svg',
      }),
    ],
    checkpoint('preview_synced', 'completed', [previewBundle.artifactId, previewPage.artifactId, 'same-page-key-preview-page']),
  );

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
    previewWithNewerCheckpoint.nextActions.includes('run_quality_check'),
    true,
    'a newer unrelated checkpoint must not hide the Quality Check action backed by current-run preview evidence',
  );

  const exportCheckpoint = checkpoint('export_ready', 'completed', [exportPptx.artifactId], {
    statusBefore: 'preview_available',
    statusAfter: 'export_ready',
  });
  const exportView = toProjectViewModel(project('export_ready'), [previewBundle, previewPage, exportPptx], [], exportCheckpoint);
  assert.equal(exportView.export?.latestExportUrl, '/projects/runtime-availability-gate/export_pptx', 'completed runtime export checkpoint should expose the current-run PPTX artifact');

  const duplicateExport = artifact('export_pptx', {
    artifactId: 'duplicate-export',
    storageKey: 'projects/runtime-availability-gate/exports/duplicate.pptx',
    createdAt: '2026-07-11T11:00:00.000Z',
  });
  const exportWithDuplicateArtifact = toProjectViewModel(
    project('export_ready'),
    [previewBundle, previewPage, exportPptx, duplicateExport],
    [],
    exportCheckpoint,
  );
  assert.equal(
    exportWithDuplicateArtifact.export?.latestExportUrl,
    '/projects/runtime-availability-gate/export_pptx',
    'completed export checkpoint must select its own PPTX rather than a newer duplicate artifact',
  );

  assertUnavailable(
    'duplicate export artifact identity in a completed checkpoint',
    'export_ready',
    [
      exportPptx,
      artifact('export_pptx', {
        artifactId: exportPptx.artifactId,
        storageKey: 'projects/runtime-availability-gate/exports/duplicate-identity.pptx',
      }),
    ],
    exportCheckpoint,
  );

  assertUnavailable(
    'duplicate export artifact reference in a completed checkpoint',
    'export_ready',
    [exportPptx],
    checkpoint('export_ready', 'completed', [exportPptx.artifactId, exportPptx.artifactId], {
      statusBefore: 'preview_available',
      statusAfter: 'export_ready',
    }),
  );

  assertUnavailable(
    'distinct export artifacts in a completed checkpoint',
    'export_ready',
    [
      exportPptx,
      artifact('export_pptx', {
        artifactId: 'second-export-pptx',
        storageKey: 'projects/runtime-availability-gate/exports/second.pptx',
      }),
    ],
    checkpoint('export_ready', 'completed', [exportPptx.artifactId, 'second-export-pptx'], {
      statusBefore: 'preview_available',
      statusAfter: 'export_ready',
    }),
  );

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
