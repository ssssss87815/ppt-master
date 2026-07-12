import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createProjectWorkbenchNodeServer } from '../app/project-workbench-node-server.ts';
import { createVerifiedExportWorkbenchDependencies } from '../app/project-workbench-verified-export-composition.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';
import { InMemoryExportPersistenceStateRepository, type ExportPersistenceSnapshot } from '../backend/state/export-persistence-unit-of-work.ts';

const NOW = '2026-07-11T15:00:00.000Z';
const PROJECT_ID = 'verified-export-node-http';
const RUN_ID = 'verified-export-node-http-run-1';

function artifact(artifactId: string, kind: ProductArtifactRef['kind'], runId = RUN_ID): ProductArtifactRef {
  return { artifactId, projectId: PROJECT_ID, kind, scope: 'run', status: 'ready', runId, storageKey: `projects/${PROJECT_ID}/${artifactId}`, createdAt: NOW, updatedAt: NOW };
}

function seed(workspacePath: string, checkpointArtifactIds = ['preview-bundle', 'preview-page-1']): ExportPersistenceSnapshot {
  const pagePath = path.join(workspacePath, 'svg_output', readdirSync(path.join(workspacePath, 'svg_output')).filter((name) => name.endsWith('.svg')).sort()[0]!);
  const pageDigest = createHash('sha256').update(readFileSync(pagePath)).digest('hex');
  const artifacts = [
    artifact('preview-bundle', 'preview_bundle'),
    {
      ...artifact('preview-page-1', 'preview_page_svg'),
      storageKey: pagePath,
      metadata: { generationProvenance: { sha256: pageDigest } },
    },
  ];
  return {
    projects: [{ projectId: PROJECT_ID, name: 'Verified export Node HTTP', status: 'preview_available', workspace: { projectId: PROJECT_ID, workspacePath }, lastRunId: RUN_ID, latestCheckpointId: 'preview-locked', createdAt: NOW, updatedAt: NOW }],
    artifacts,
    checkpoints: [{ checkpointId: 'preview-locked', projectId: PROJECT_ID, stage: 'preview_synced', status: 'completed', statusBefore: 'generation_in_progress', statusAfter: 'preview_available', artifactIds: checkpointArtifactIds, createdAt: NOW }],
    attempts: [],
  };
}

async function start(state: InMemoryExportPersistenceStateRepository, rootDir: string) {
  const server = createProjectWorkbenchNodeServer(createVerifiedExportWorkbenchDependencies(state, { rootDir, now: () => NOW }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function stop(server: ReturnType<typeof createProjectWorkbenchNodeServer>) {
  server.close();
  await once(server, 'close');
}

async function exportRequest(origin: string, idempotencyKey: string) {
  return fetch(`${origin}/projects/${PROJECT_ID}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export_pptx', idempotencyKey }) });
}

async function main() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ppt-verified-export-node-http-'));
  const workspace = path.join(root, 'workspace');
  cpSync(path.resolve('productization/test-fixtures/runtime-workspace'), workspace, { recursive: true });
  try {
    const state = new InMemoryExportPersistenceStateRepository(seed(workspace));
    const first = await start(state, root);
    try {
      const success = await exportRequest(first.origin, 'idempotency-1');
      assert.equal(success.status, 200, 'production Node HTTP composition should return a committed export page');
      assert.match(await success.text(), /export_ready/);
    } finally {
      await stop(first.server);
    }

    const durable = state.snapshot();
    assert.equal(durable.projects[0]?.status, 'export_ready', 'fresh state must expose the committed project');
    assert.equal(durable.attempts[0]?.status, 'completed', 'fresh state must expose the completed export attempt');
    assert.equal(durable.checkpoints.at(-1)?.stage, 'export_ready', 'fresh state must expose the export checkpoint');
    const primary = durable.artifacts.find((item) => item.kind === 'export_pptx' && !item.storageKey.includes('.staging'));
    assert.ok(primary, 'fresh state must expose a durable PPTX artifact');
    const durablePptx = path.resolve(root, primary.storageKey);
    assert.ok(existsSync(durablePptx), 'completed state must point at a readable PPTX');

    const replayable = await start(state, root);
    try {
      const reuse = await exportRequest(replayable.origin, 'idempotency-1');
      assert.equal(reuse.status, 200, 'a restarted HTTP composition should reuse a revalidated durable idempotent delivery');
      assert.equal(state.snapshot().attempts.length, 1, 'idempotent reuse must not publish a second attempt');
    } finally {
      await stop(replayable.server);
    }

    rmSync(durablePptx);
    const missingDelivery = await start(state, root);
    try {
      const rejected = await exportRequest(missingDelivery.origin, 'idempotency-1');
      assert.equal(rejected.status, 500, 'a completed replay must reject a missing promoted PPTX');
      assert.doesNotMatch(await rejected.text(), /exports\//, 'missing durable output must not be advertised to the browser');
      assert.equal(state.snapshot().attempts.length, 1, 'invalid replay must not publish a replacement attempt');
    } finally {
      await stop(missingDelivery.server);
    }

    const restarted = await start(state, root);
    try {
      const reuse = await exportRequest(restarted.origin, 'idempotency-1');
      assert.equal(reuse.status, 500, 'a restarted HTTP composition must not reuse an unavailable durable delivery');
      assert.doesNotMatch(await reuse.text(), /exports\//, 'unavailable delivery must not be advertised to the browser');
      assert.equal(state.snapshot().attempts.length, 1, 'invalid replay must not publish a second attempt');
    } finally {
      await stop(restarted.server);
    }

    const staleCheckpointState = new InMemoryExportPersistenceStateRepository(seed(workspace, ['preview-bundle', 'stale-page']));
    const staleCheckpoint = await start(staleCheckpointState, root);
    try {
      const rejected = await exportRequest(staleCheckpoint.origin, 'stale-key');
      assert.equal(rejected.status, 500, 'stale or cross-run preview evidence must be rejected before export delivery');
      assert.doesNotMatch(await rejected.text(), /workspace/);
      assert.equal(staleCheckpointState.snapshot().attempts.length, 0, 'invalid evidence must not reserve an export attempt');
    } finally {
      await stop(staleCheckpoint.server);
    }

    const staleWorkspace = path.join(root, 'stale-workspace');
    cpSync(path.resolve('productization/test-fixtures/runtime-workspace'), staleWorkspace, { recursive: true });
    const stalePage = path.join(staleWorkspace, 'svg_output', readdirSync(path.join(staleWorkspace, 'svg_output')).filter((name) => name.endsWith('.svg')).sort()[0]!);
    const staleState = new InMemoryExportPersistenceStateRepository(seed(staleWorkspace));
    writeFileSync(stalePage, '<svg xmlns="http://www.w3.org/2000/svg"><text>changed after preview lock</text></svg>');
    const stale = await start(staleState, root);
    try {
      const rejected = await exportRequest(stale.origin, 'workspace-drift');
      assert.equal(rejected.status, 500, 'workspace SVGs changed after preview lock must be rejected before export delivery');
      assert.match(await rejected.text(), /current-run preview evidence is unavailable/);
      assert.equal(staleState.snapshot().attempts.length, 0, 'workspace drift must not reserve an export attempt');
    } finally {
      await stop(stale.server);
    }

    const failureRoot = path.join(root, 'persistence-failure');
    mkdirSync(failureRoot);
    writeFileSync(path.join(failureRoot, 'exports'), 'not a directory');
    const failureState = new InMemoryExportPersistenceStateRepository(seed(workspace));
    const failing = await start(failureState, failureRoot);
    try {
      const failed = await exportRequest(failing.origin, 'persistence-failure');
      assert.equal(failed.status, 500, 'filesystem persistence failure must not return delivery');
      const rolledBack = failureState.snapshot();
      assert.equal(rolledBack.projects[0]?.status, 'preview_available');
      assert.equal(rolledBack.artifacts.length, 2);
      assert.equal(rolledBack.checkpoints.length, 1);
      assert.equal(rolledBack.attempts[0]?.status, 'failed_recoverable');
    } finally {
      await stop(failing.server);
    }

    console.log('project workbench verified export node server test: ok');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
