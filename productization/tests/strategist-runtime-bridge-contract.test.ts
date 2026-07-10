import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runStrategistFromLockedConfirmations } from '../backend/adapter/strategist-runtime-bridge';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';

function requireArtifact(artifacts: ProductArtifactRef[], kind: 'design_spec' | 'spec_lock'): ProductArtifactRef {
  const artifact = artifacts.find((item) => item.kind === kind);
  assert.ok(artifact, `expected artifact kind=${kind}`);
  return artifact;
}

test('strategist runtime bridge materializes canonical markdown artifacts from locked confirmations', () => {
  const repoRoot = process.cwd();
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-bridge-'));
  const workspacePath = path.join(tempRoot, 'projects', 'proj_demo');
  mkdirSync(path.join(workspacePath, 'confirmations'), { recursive: true });
  mkdirSync(path.join(workspacePath, 'sources'), { recursive: true });

  writeFileSync(
    path.join(workspacePath, 'confirmations', 'result.json'),
    JSON.stringify(
      {
        canvas: 'ppt169',
        page_count: '10-12',
        audience: 'founders',
        content_divergence: 'restructure allowed',
        mode: 'instructional',
        visual_style: 'soft-rounded',
        icons: 'tabler-outline',
        color: {
          palette: {
            background: '#F6FBF8',
            secondary_bg: '#E7F4EC',
            primary: '#2F7D4A',
            accent: '#7BC96F',
            secondary_accent: '#2FA7A0',
            body_text: '#1E2A22',
          },
        },
        typography: {
          heading: { cjk: 'Microsoft YaHei', latin: 'Arial', css: '"Microsoft YaHei", Arial, sans-serif' },
          body: { cjk: 'Microsoft YaHei', latin: 'Arial', css: '"Microsoft YaHei", Arial, sans-serif' },
          body_size: 22,
        },
        formula_policy: 'mixed',
        image_usage: 'ai',
        image_ai_path: 'auto',
        image_strategy: {
          rendering: 'vector-illustration',
          mood: 'clean and calm',
        },
        generation_mode: 'continuous',
      },
      null,
      2,
    ),
  );

  const project: ProjectRecord = {
    projectId: 'proj_demo',
    name: 'Demo',
    status: 'confirmation_locked',
    workspace: {
      projectId: 'proj_demo',
      workspacePath: path.relative(repoRoot, workspacePath),
    },
    createdAt: '2026-07-08T00:00:00.000Z',
    updatedAt: '2026-07-08T00:00:00.000Z',
  };

  try {
    const result = runStrategistFromLockedConfirmations({
      project,
      payload: {
        answers: {
          audience: 'founders',
          goal: 'align narrative',
          tone: 'crisp',
          language: 'zh-CN',
          brand: 'PPTMASTER',
          outline: 'problem-solution-proof-ask',
          visual_style: 'clean',
          delivery: 'live pitch',
        },
        lockedAt: '2026-07-08T01:02:03.000Z',
      },
      scriptPathOverride: path.join(repoRoot, 'skills/ppt-master/scripts/materialize_from_confirmations.py'),
    });

    assert.equal(result.runtimeStatus, 'materialized');
    const designSpec = requireArtifact(result.artifacts, 'design_spec');
    const specLock = requireArtifact(result.artifacts, 'spec_lock');
    assert.equal(designSpec.status, 'ready');
    assert.equal(specLock.status, 'locked');

    const designSpecContent = readFileSync(path.join(workspacePath, 'design_spec.md'), 'utf8');
    const specLockContent = readFileSync(path.join(workspacePath, 'spec_lock.md'), 'utf8');
    assert.match(designSpecContent, /Presentation Intent/);
    assert.match(designSpecContent, /Audience: founders/);
    assert.match(specLockContent, /## colors/);
    assert.match(specLockContent, /- primary: #2F7D4A/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
