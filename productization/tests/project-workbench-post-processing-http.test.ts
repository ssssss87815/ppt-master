import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { handleProjectWorkbenchHttpRequest } from '../app/project-workbench-http-route.ts';
import { createVerifiedExportWorkbenchDependencies } from '../app/project-workbench-verified-export-composition.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { InMemoryExportPersistenceStateRepository } from '../backend/state/export-persistence-unit-of-work.ts';

const NOW = '2026-07-13T12:30:00.000Z';
const PROJECT_ID = 'workbench-post-processing-project';
const RUN_ID = 'workbench-post-processing-run';

async function main() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-workbench-post-processing-'));
  try {
    const workspace = path.join(root, 'workspace');
    cpSync('productization/test-fixtures/runtime-workspace', workspace, { recursive: true });
    const project: ProjectRecord = { projectId: PROJECT_ID, name: 'Post processing HTTP proof', status: 'preview_available', workspace: { projectId: PROJECT_ID, workspacePath: workspace }, lastRunId: RUN_ID, createdAt: NOW, updatedAt: NOW };
    const pages: ProductArtifactRef[] = readdirSync(path.join(workspace, 'svg_output')).filter((name) => name.endsWith('.svg')).sort().slice(0, 2).map((filename, index) => {
      const storageKey = path.join(workspace, 'svg_output', filename);
      return { artifactId: `page-${index + 1}`, projectId: PROJECT_ID, kind: 'preview_page_svg', scope: 'page', status: 'ready', pageKey: `page-${index + 1}`, runId: RUN_ID, storageKey, createdAt: NOW, updatedAt: NOW, metadata: { generationProvenance: { filename, storageKey, sha256: createHash('sha256').update(readFileSync(storageKey)).digest('hex') } } };
    });
    const bundle: ProductArtifactRef = { artifactId: 'bundle', projectId: PROJECT_ID, kind: 'preview_bundle', scope: 'run', status: 'ready', runId: RUN_ID, storageKey: path.join(workspace, 'preview', 'index.json'), createdAt: NOW, updatedAt: NOW };
    const report: ProductArtifactRef = { artifactId: 'quality-report', projectId: PROJECT_ID, kind: 'quality_report', scope: 'run', status: 'ready', runId: RUN_ID, storageKey: path.join(workspace, 'quality', 'quality-report.json'), createdAt: NOW, updatedAt: NOW, metadata: { sourcePreviewCheckpointId: 'preview', sha256: 'a'.repeat(64), summary: { passed: true } } };
    const checkpoints: WorkflowCheckpoint[] = [
      { checkpointId: 'preview', projectId: PROJECT_ID, stage: 'preview_synced', status: 'completed', statusBefore: 'generation_in_progress', statusAfter: 'preview_available', artifactIds: [bundle.artifactId, ...pages.map((page) => page.artifactId)], createdAt: NOW },
      { checkpointId: 'quality', projectId: PROJECT_ID, stage: 'quality_checked', status: 'completed', statusBefore: 'preview_available', statusAfter: 'preview_available', artifactIds: [report.artifactId], createdAt: NOW },
    ];
    const state = new InMemoryExportPersistenceStateRepository({ projects: [project], artifacts: [bundle, ...pages, report], checkpoints });
    const dependencies = createVerifiedExportWorkbenchDependencies(state, {
      rootDir: root, now: () => NOW,
      postProcessingRunner(input) {
        const finalDir = path.join(input.project.workspace.workspacePath, 'svg_final');
        mkdirSync(finalDir, { recursive: true });
        for (const page of input.pages) {
          const target = path.join(finalDir, path.basename(page.storageKey));
          cpSync(page.storageKey, target);
        }
        return { errors: 0, warnings: 0 };
      },
    });
    const response = await handleProjectWorkbenchHttpRequest(dependencies, { method: 'POST', url: `/projects/${PROJECT_ID}`, body: JSON.stringify({ action: 'run_post_processing' }) });
    assert.equal(response.status, 200, response.body);
    const persisted = state.snapshot();
    assert.equal(persisted.projects[0]?.status, 'post_processing');
    assert.equal(persisted.artifacts.filter((artifact) => artifact.kind === 'final_page_svg' && artifact.status === 'ready').length, 2);
    assert.equal(persisted.checkpoints.some((checkpoint) => checkpoint.stage === 'post_processed' && checkpoint.status === 'completed'), true);
    const exportResponse = await handleProjectWorkbenchHttpRequest(dependencies, { method: 'POST', url: `/projects/${PROJECT_ID}`, body: JSON.stringify({ action: 'export_pptx', idempotencyKey: 'must-not-export-final-svg' }) });
    assert.equal(exportResponse.status, 400);
    assert.match(exportResponse.body, /preview_available/);
    console.log('project workbench post-processing HTTP test: ok');
  } finally { rmSync(root, { recursive: true, force: true }); }
}
void main();
