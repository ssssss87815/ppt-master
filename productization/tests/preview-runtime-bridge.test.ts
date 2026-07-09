import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runPreviewFromWorkspace } from '../backend/adapter/preview-runtime-bridge';
import type { ProjectRecord } from '../backend/models/projects';

function createWorkspaceFixture(): { root: string; project: ProjectRecord } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-preview-bridge-'));
  const svgDir = path.join(root, 'svg_output');
  mkdirSync(svgDir, { recursive: true });
  mkdirSync(path.join(root, 'preview'), { recursive: true });
  writeFileSync(path.join(svgDir, '01_cover.svg'), '<svg viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#ffffff"/></svg>');
  writeFileSync(path.join(svgDir, '02_body.svg'), '<svg viewBox="0 0 1280 720"><circle cx="100" cy="100" r="50" fill="#2F7D4A"/></svg>');
  writeFileSync(
    path.join(root, 'preview', 'generation-manifest.json'),
    JSON.stringify(
      {
        generatedAt: '2026-07-08T11:04:00.000Z',
        pages: [
          {
            filename: '01_cover.svg',
            storageKey: path.join(root, 'svg_output', '01_cover.svg'),
            sha256: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
          },
          {
            filename: '02_body.svg',
            storageKey: path.join(root, 'svg_output', '02_body.svg'),
            sha256: 'def456abc123def456abc123def456abc123def456abc123def456abc123def4',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const project: ProjectRecord = {
    projectId: 'pptmaster-preview-bridge-project',
    name: 'PPTMASTER Preview Bridge Project',
    status: 'generation_in_progress',
    workspace: {
      projectId: 'pptmaster-preview-bridge-project',
      workspacePath: root,
    },
    lastRunId: 'pptmaster-preview-bridge-project-run-1',
    createdAt: '2026-07-08T11:00:00.000Z',
    updatedAt: '2026-07-08T11:00:00.000Z',
  };

  return { root, project };
}

test('preview runtime bridge emits preview bundle and page artifacts from workspace svg_output with generation provenance', () => {
  const fixture = createWorkspaceFixture();

  try {
    const result = runPreviewFromWorkspace(fixture.project, '2026-07-08T11:05:00.000Z');
    assert.equal(result.runtimeStatus, 'preview_synced');

    const previewBundle = result.artifacts.find((item) => item.kind === 'preview_bundle');
    assert.ok(previewBundle, 'preview bundle artifact should exist');
    assert.equal(previewBundle?.metadata?.generationManifestGeneratedAt, '2026-07-08T11:04:00.000Z');
    assert.equal(previewBundle?.metadata?.generationManifestPageCount, 2);

    const previewPages = result.artifacts.filter((item) => item.kind === 'preview_page_svg');
    assert.equal(previewPages.length, 2, 'two preview page artifacts should exist');
    assert.equal(
      previewPages[0]?.metadata?.generationProvenance && typeof previewPages[0]?.metadata?.generationProvenance === 'object',
      true,
    );
    assert.match(String((previewPages[0]?.metadata?.generationProvenance as { sha256?: string } | undefined)?.sha256 ?? ''), /^[a-f0-9]{64}$/);

    const previewManifestPath = path.join(fixture.root, 'preview', 'index.json');
    assert.ok(existsSync(previewManifestPath), 'preview manifest should be materialized');
    const previewManifest = JSON.parse(readFileSync(previewManifestPath, 'utf8')) as {
      generationManifestGeneratedAt?: string;
      generationManifestPageCount?: number;
      pages: Array<{
        label: string;
        generationProvenance?: { filename?: string; storageKey?: string; sha256?: string } | null;
      }>;
    };
    assert.equal(previewManifest.generationManifestGeneratedAt, '2026-07-08T11:04:00.000Z');
    assert.equal(previewManifest.generationManifestPageCount, 2);
    assert.equal(previewManifest.pages[0]?.generationProvenance?.filename, '01_cover.svg');
    assert.match(String(previewManifest.pages[0]?.generationProvenance?.sha256 ?? ''), /^[a-f0-9]{64}$/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
