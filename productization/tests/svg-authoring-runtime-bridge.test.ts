import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runSvgAuthoringProbe } from '../backend/adapter/svg-authoring-runtime-bridge';
import type { ProjectRecord } from '../backend/models/projects';

function createWorkspaceFixture(svgName = '01_cover.svg'): { root: string; project: ProjectRecord } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-svg-authoring-bridge-'));
  const workspace = path.join(root, 'workspace');
  mkdirSync(path.join(workspace, 'svg_output'), { recursive: true });
  writeFileSync(path.join(workspace, 'design_spec.md'), '# design spec\n', 'utf8');
  writeFileSync(path.join(workspace, 'spec_lock.md'), '## colors\n- primary: #2F7D4A\n', 'utf8');
  writeFileSync(
    path.join(workspace, 'svg_output', svgName),
    '<svg viewBox="0 0 1280 720"><rect id="bg" width="1280" height="720" fill="#ffffff"/></svg>',
    'utf8',
  );

  const project: ProjectRecord = {
    projectId: 'probe-project',
    name: 'Probe Project',
    status: 'generation_in_progress',
    workspace: {
      projectId: 'probe-project',
      workspacePath: workspace,
    },
    lastRunId: 'probe-project-run-1',
    createdAt: '2026-07-08T10:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
  };

  return { root, project };
}

test('svg authoring runtime bridge mutates copied workspace SVG through live preview save-all path', () => {
  const fixture = createWorkspaceFixture();

  try {
    const result = runSvgAuthoringProbe(fixture.project, '2026-07-08T10:05:00.000Z');
    assert.equal(result.runtimeStatus, 'mutated');
    assert.equal(result.artifacts.length, 1);
    assert.equal(result.artifacts[0]?.metadata?.verification, 'runtime_svg_authoring_probe');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('svg authoring runtime bridge falls back to first available svg when legacy cover filename is absent', () => {
  const fixture = createWorkspaceFixture('z_custom_first.svg');

  try {
    const result = runSvgAuthoringProbe(fixture.project, '2026-07-08T10:06:00.000Z');
    assert.equal(result.runtimeStatus, 'mutated');
    assert.equal(result.artifacts.length, 1);
    assert.match(String(result.artifacts[0]?.metadata?.targetFile ?? ''), /z_custom_first\.svg$/);
    assert.equal(result.artifacts[0]?.metadata?.verification, 'runtime_svg_authoring_probe');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
