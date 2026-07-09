import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { exportLocalPhase, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner';
import type { ProjectRecord } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';

const source = '/tmp/ppt-downstream-svg-probe';
assert.ok(existsSync(source), `fixture source missing: ${source}`);
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-inspect-project-view-'));
const workspacePath = path.join(tempRoot, 'workspace');
cpSync(source, workspacePath, { recursive: true });

try {
  const project: ProjectRecord = {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status: 'generation_in_progress',
    workspace: { projectId: 'pptmaster-demo-project', workspacePath },
    lastRunId: 'pptmaster-demo-project-run-1751300700000',
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:20:00.000Z',
  };
  const previewed = syncPreviewArtifacts(project, '2026-06-30T16:25:00.000Z');
  const exported = exportLocalPhase(previewed.project, '2026-06-30T16:40:00.000Z');
  const checkpoint = exported.checkpoints[0]!;
  const view = toProjectViewModel(exported.project, [...previewed.artifacts, ...exported.artifacts], [], checkpoint);
  console.log(JSON.stringify({ preview: view.preview, export: view.export, delivery: view.delivery }, null, 2));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
