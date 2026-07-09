import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGenerationFromWorkspace } from '../backend/adapter/generation-runtime-bridge';
import type { ProjectRecord } from '../backend/models/projects';

function createWorkspaceFixture(): { root: string; project: ProjectRecord } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-generation-bridge-'));
  const workspace = path.join(root, 'workspace');
  mkdirSync(path.join(workspace, 'svg_output'), { recursive: true });
  mkdirSync(path.join(workspace, 'preview'), { recursive: true });
  writeFileSync(path.join(workspace, 'design_spec.md'), '# design spec\n', 'utf8');
  writeFileSync(path.join(workspace, 'spec_lock.md'), '## colors\n- primary: #2F7D4A\n', 'utf8');
  writeFileSync(path.join(workspace, 'svg_output', '01_cover.svg'), '<svg><rect id="bg" width="10" height="10" fill="#fff"/></svg>', 'utf8');
  writeFileSync(path.join(workspace, 'svg_output', '02_body.svg'), '<svg><circle id="dot" cx="5" cy="5" r="2" fill="#000"/></svg>', 'utf8');

  const project: ProjectRecord = {
    projectId: 'pptmaster-generation-bridge-project',
    name: 'PPTMASTER Generation Bridge Project',
    status: 'generation_in_progress',
    workspace: {
      projectId: 'pptmaster-generation-bridge-project',
      workspacePath: workspace,
    },
    lastRunId: 'pptmaster-generation-bridge-project-run-1',
    createdAt: '2026-07-08T11:00:00.000Z',
    updatedAt: '2026-07-08T11:00:00.000Z',
  };

  return { root, project };
}

test('generation runtime bridge records per-page workspace evidence as dict-shaped provenance entries', () => {
  const fixture = createWorkspaceFixture();

  try {
    const result = runGenerationFromWorkspace(fixture.project, '2026-07-08T11:05:00.000Z');
    assert.equal(result.runtimeStatus, 'generation_synced');
    assert.equal(result.artifacts.length, 1);

    const artifact = result.artifacts[0];
    assert.equal(artifact?.metadata?.verification, 'runtime_workspace_generation_bridge');
    const pages = artifact?.metadata?.pages as Array<{ filename?: string; storageKey?: string; sha256?: string }>;
    assert.equal(Array.isArray(pages), true);
    assert.equal(pages.length, 2);
    assert.match(String(pages[0]?.filename ?? ''), /01_cover\.svg$/);
    assert.match(String(pages[1]?.filename ?? ''), /02_body\.svg$/);
    assert.match(String(pages[0]?.storageKey ?? ''), /svg_output\/01_cover\.svg$/);
    assert.match(String(pages[0]?.sha256 ?? ''), /^[a-f0-9]{64}$/);

    const manifestPath = path.join(fixture.project.workspace.workspacePath, 'preview', 'generation-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      pages: Array<{ filename?: string; storageKey?: string; sha256?: string }>;
    };
    assert.equal(manifest.pages.length, 2);
    assert.match(String(manifest.pages[0]?.filename ?? ''), /01_cover\.svg$/);
    assert.match(String(manifest.pages[0]?.sha256 ?? ''), /^[a-f0-9]{64}$/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
