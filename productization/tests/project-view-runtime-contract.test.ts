import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { exportLocalPhase, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner';
import type { ProjectRecord } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = '/tmp/ppt-downstream-svg-probe';
  assert.ok(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-project-view-runtime-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  const fixture = makeWorkspaceFixture();
  try {
    const project: ProjectRecord = {
      projectId: 'pptmaster-demo-project',
      name: 'PPTMASTER Demo Project',
      status: 'generation_in_progress',
      workspace: {
        projectId: 'pptmaster-demo-project',
        workspacePath: fixture.workspacePath,
      },
      lastRunId: 'pptmaster-demo-project-run-1751300700000',
      createdAt: '2026-06-30T16:00:00.000Z',
      updatedAt: '2026-06-30T16:20:00.000Z',
    };

    const previewed = syncPreviewArtifacts(project, '2026-06-30T16:25:00.000Z');
    const exported = exportLocalPhase(previewed.project, '2026-06-30T16:40:00.000Z');
    const checkpoint = exported.checkpoints[0];
    assert.ok(checkpoint, 'export phase should yield a checkpoint for project-view projection');

    const view = toProjectViewModel(exported.project, [...previewed.artifacts, ...exported.artifacts], [], checkpoint);

    assert.equal(view.projectId, 'pptmaster-demo-project', 'project view should expose project id');
    assert.equal(view.status, 'export_ready', 'project view should expose latest project status');
    assert.ok(view.preview, 'project view should expose preview section');
    assert.ok(view.export, 'project view should expose export section');
    assert.ok(view.delivery, 'project view should expose delivery section');

    assert.equal(view.preview?.pageCount, 10, 'project view should expose preview page count from runtime bundle');
    assert.ok((view.preview?.latestPreviewUrl ?? '').endsWith('/preview/index.json'), 'project view should expose preview manifest url');
    assert.ok((view.preview?.manifestStorageKey ?? '').endsWith('/preview/index.json'), 'project view should expose preview manifest storage key');
    assert.ok((view.preview?.pageArtifactIds ?? []).includes('pptmaster-demo-project-page-1'), 'project view should expose runtime preview page artifact ids');
    assert.ok((view.preview?.items ?? []).some((item) => item.artifactId === 'pptmaster-demo-project-preview-bundle' && item.role === 'bundle'), 'project view should expose preview bundle item');
    assert.ok((view.preview?.items ?? []).some((item) => item.artifactId === 'pptmaster-demo-project-page-1' && item.role === 'page' && item.pageKey === 'page-1'), 'project view should expose first preview page item');
    assert.ok((view.preview?.items ?? []).some((item) => item.artifactId === 'pptmaster-demo-project-page-1' && item.role === 'page' && item.generationProvenance?.filename === '01_封面｜低碳生活.svg'), 'project view should expose preview page generation provenance');

    assert.ok((view.export?.latestExportUrl ?? '').endsWith('.pptx'), 'project view should expose export url');
    assert.ok((view.export?.companionStorageKeys ?? []).some((key) => key.endsWith('.md')), 'project view should expose markdown companion storage key');
    assert.ok((view.export?.companionStorageKeys ?? []).some((key) => key.endsWith('/image_manifest.json')), 'project view should expose image manifest companion storage key');

    assert.equal(view.delivery?.primaryArtifactId, 'pptmaster-demo-project-export-pptx', 'delivery should point at primary pptx artifact');
    assert.ok((view.delivery?.primaryStorageKey ?? '').endsWith('.pptx'), 'delivery should expose primary pptx storage key');
    assert.ok((view.delivery?.companionArtifactIds ?? []).includes('pptmaster-demo-project-export-md'), 'delivery should include markdown companion artifact id');
    assert.ok((view.delivery?.companionArtifactIds ?? []).includes('pptmaster-demo-project-image-manifest'), 'delivery should include image manifest artifact id');

    console.log('project-view runtime contract test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
