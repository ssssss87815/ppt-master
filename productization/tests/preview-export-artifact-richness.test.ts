import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { exportLocalPhase, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner';
import type { ProjectRecord } from '../backend/models/projects';

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = 'productization/test-fixtures/runtime-workspace';
  assert.ok(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-preview-export-richness-'));
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
    const normalizationArtifact = previewed.artifacts.find((item) => item.metadata?.verification === 'runtime_workspace_generation_bridge' && item.metadata?.role === 'generation_evidence');
    const previewBundle = previewed.artifacts.find((item) => item.kind === 'preview_bundle');
    const previewPage = previewed.artifacts.find((item) => item.kind === 'preview_page_svg');

    assert.ok(normalizationArtifact, 'preview sync should return normalization generation evidence');
    assert.ok(previewBundle, 'preview sync should create a preview bundle artifact');
    assert.equal(previewBundle?.mimeType, 'application/json', 'preview bundle should expose a JSON mime type');
    assert.equal(previewBundle?.metadata?.pageCount, 10, 'preview bundle should expose page count metadata');
    assert.ok(previewBundle?.storageKey.endsWith('/preview/index.json'), 'preview bundle should surface manifest storage key through storageKey');
    assert.equal(previewPage?.pageKey, 'page-1', 'preview page should expose first page key');
    assert.equal(previewPage?.storageKey.endsWith('/svg_output/01_封面｜低碳生活.svg'), true, 'preview page should point at the first workspace svg');
    const generationProvenance = previewPage?.metadata?.generationProvenance;
    const generationFilename = generationProvenance && typeof generationProvenance === 'object'
      ? (generationProvenance as { filename?: unknown }).filename
      : undefined;
    assert.equal(
      generationFilename,
      '01_封面｜低碳生活.svg',
      'preview page should expose generation provenance for the first svg',
    );

    assert.throws(
      () => exportLocalPhase(previewed.project, '2026-06-30T16:40:00.000Z'),
      /local export is not a delivery path/,
      'local export must not create an unverified export artifact',
    );

    console.log('preview/export artifact richness test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
