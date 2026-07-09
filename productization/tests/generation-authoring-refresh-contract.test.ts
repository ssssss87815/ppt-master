import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGenerationFromWorkspace } from '../backend/adapter/generation-runtime-bridge';
import { runSvgAuthoringProbe } from '../backend/adapter/svg-authoring-runtime-bridge';
import type { ProjectRecord } from '../backend/models/projects';

function createWorkspaceFixture(): { root: string; workspace: string; project: ProjectRecord } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-generation-authoring-refresh-'));
  const workspace = path.join(root, 'workspace');
  mkdirSync(path.join(workspace, 'svg_output'), { recursive: true });
  mkdirSync(path.join(workspace, 'preview'), { recursive: true });
  writeFileSync(path.join(workspace, 'design_spec.md'), '# design spec\n', 'utf8');
  writeFileSync(path.join(workspace, 'spec_lock.md'), '## colors\n- primary: #2F7D4A\n', 'utf8');
  writeFileSync(
    path.join(workspace, 'svg_output', '01_cover.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><rect id="bg" width="10" height="10" fill="#fff"/><text id="title" x="1" y="5">Hello</text></svg>',
    'utf8',
  );
  writeFileSync(
    path.join(workspace, 'svg_output', '02_body.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><circle id="dot" cx="5" cy="5" r="2" fill="#000"/></svg>',
    'utf8',
  );

  const project: ProjectRecord = {
    projectId: 'pptmaster-generation-authoring-refresh-project',
    name: 'PPTMASTER Generation Authoring Refresh Project',
    status: 'generation_in_progress',
    workspace: {
      projectId: 'pptmaster-generation-authoring-refresh-project',
      workspacePath: workspace,
      sourceBundlePath: path.join(workspace, 'sources.md'),
      templateDeckPath: undefined,
      canvas: '16:9',
      language: 'zh-CN',
      createdAt: '2026-07-08T11:00:00.000Z',
      updatedAt: '2026-07-08T11:00:00.000Z',
    },
    confirmations: { recommendationCount: 0, status: 'approved', lockedAt: '2026-07-08T11:00:00.000Z' },
    artifacts: [],
    activity: [],
    createdAt: '2026-07-08T11:00:00.000Z',
    updatedAt: '2026-07-08T11:00:00.000Z',
  };

  return { root, workspace, project };
}

test('authoring mutation can be captured by a refreshed generation manifest', () => {
  const fixture = createWorkspaceFixture();

  try {
    const before = runGenerationFromWorkspace(fixture.project, '2026-07-08T11:05:00.000Z');
    assert.equal(before.runtimeStatus, 'generation_synced');
    const beforePages = before.artifacts[0]?.metadata?.pages as Array<{ filename: string; sha256: string }>;
    const beforeCover = beforePages.find((page) => page.filename === '01_cover.svg');
    assert.ok(beforeCover);

    const authoring = runSvgAuthoringProbe(fixture.project, '2026-07-08T11:06:00.000Z');
    assert.equal(authoring.runtimeStatus, 'mutated');
    const authoringMeta = authoring.artifacts[0]?.metadata as {
      targetFile: string;
      afterHash: string;
      syncedBackToWorkspace: boolean;
    };
    assert.match(authoringMeta.targetFile, /01_cover\.svg$/);
    assert.equal(authoringMeta.syncedBackToWorkspace, true);
    assert.match(authoringMeta.afterHash, /^[a-f0-9]{64}$/);

    const refreshed = runGenerationFromWorkspace(fixture.project, '2026-07-08T11:07:00.000Z');
    assert.equal(refreshed.runtimeStatus, 'generation_synced');
    const refreshedPages = refreshed.artifacts[0]?.metadata?.pages as Array<{ filename: string; sha256: string }>;
    const refreshedCover = refreshedPages.find((page) => page.filename === '01_cover.svg');
    assert.ok(refreshedCover);
    assert.notEqual(refreshedCover.sha256, beforeCover.sha256);
    assert.equal(refreshedCover.sha256, authoringMeta.afterHash);

    const persistedManifestPath = path.join(fixture.workspace, 'preview', 'generation-manifest.json');
    const persistedManifest = JSON.parse(readFileSync(persistedManifestPath, 'utf8')) as {
      generatedAt: string;
      pages: Array<{ filename: string; sha256: string }>;
    };
    const persistedCover = persistedManifest.pages.find((page) => page.filename === '01_cover.svg');
    assert.ok(persistedCover);
    assert.equal(persistedCover.sha256, authoringMeta.afterHash);
    assert.equal(persistedManifest.generatedAt, '2026-07-08T11:07:00.000Z');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
