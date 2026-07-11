import { strict as assert } from 'node:assert';

import {
  InMemoryExportPersistenceStore,
  type ExportCommitInput,
  type ExportPersistenceSnapshot,
} from '../backend/state/export-persistence-unit-of-work.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.ts';

const PROJECT_ID = 'project-1';
const RUN_ID = 'run-1';
const EXPORT_KEY = 'project-1:run-1:preview-1:pptx';
const ATTEMPT_ID = 'attempt-1';
const NOW = '2026-07-11T08:00:00.000Z';

function project(): ProjectRecord {
  return {
    projectId: PROJECT_ID,
    name: 'Export persistence fixture',
    status: 'preview_available',
    workspace: { projectId: PROJECT_ID, workspacePath: '/tmp/project-1' },
    lastRunId: RUN_ID,
    latestCheckpointId: 'preview-1',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function artifact(id: string, kind: ProductArtifactRef['kind']): ProductArtifactRef {
  return {
    artifactId: id,
    projectId: PROJECT_ID,
    kind,
    scope: 'run',
    status: 'ready',
    runId: RUN_ID,
    storageKey: `/exports/${id}${kind === 'export_pptx' ? '.pptx' : '.json'}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function checkpoint(artifactIds: string[]): WorkflowCheckpoint {
  return {
    checkpointId: 'export-ready-1',
    projectId: PROJECT_ID,
    stage: 'export_ready',
    status: 'completed',
    statusBefore: 'preview_available',
    statusAfter: 'export_ready',
    artifactIds,
    createdAt: NOW,
  };
}

function reservation() {
  return {
    attemptId: ATTEMPT_ID,
    projectId: PROJECT_ID,
    exportKey: EXPORT_KEY,
    idempotencyKey: 'client-key-1',
    format: 'pptx' as const,
    runId: RUN_ID,
    previewCheckpointId: 'preview-1',
    previewArtifactIds: ['preview-bundle-1', 'preview-page-1'],
    previewArtifactDigest: 'sha256-preview-1',
    leaseOwner: 'worker-a',
    leaseExpiresAt: '2026-07-11T08:05:00.000Z',
    now: NOW,
  };
}

function commitInput(): ExportCommitInput {
  const artifacts = [artifact('export-1', 'export_pptx'), artifact('export-companion-1', 'runtime_log')];
  return {
    attemptId: ATTEMPT_ID,
    leaseOwner: 'worker-a',
    project: {
      ...project(),
      status: 'export_ready',
      latestCheckpointId: 'export-ready-1',
      updatedAt: '2026-07-11T08:01:00.000Z',
    },
    artifacts,
    checkpoint: checkpoint(artifacts.map((item) => item.artifactId)),
    now: '2026-07-11T08:01:00.000Z',
  };
}

function snapshot(store: InMemoryExportPersistenceStore): ExportPersistenceSnapshot {
  return store.open().snapshot();
}

async function reserve(store: InMemoryExportPersistenceStore) {
  const result = await store.open().reserve(reservation());
  assert.equal(result.kind, 'reserved', 'fixture reservation should reserve the export key');
  return result;
}

async function assertAtomicFailure(failOn: 'project' | 'artifacts' | 'checkpoint' | 'attempt') {
  const store = new InMemoryExportPersistenceStore({ projects: [project()] }, { failOn });
  await reserve(store);
  const before = snapshot(store);

  await assert.rejects(store.open().commit(commitInput()), new RegExp(`forced ${failOn} commit failure`));

  const freshRead = snapshot(store);
  assert.deepEqual(freshRead, before, `${failOn} failure must leave no partially committed project, artifacts, checkpoint, or attempt state`);
  assert.equal(freshRead.projects[0]?.status, 'preview_available', `${failOn} failure must not expose export_ready`);
  assert.equal(freshRead.artifacts.length, 0, `${failOn} failure must not expose export artifacts`);
  assert.equal(freshRead.checkpoints.length, 0, `${failOn} failure must not expose an export checkpoint`);
  assert.equal(freshRead.attempts[0]?.status, 'reserved', `${failOn} failure must not partially complete the attempt`);
}

async function main() {
  for (const failOn of ['project', 'artifacts', 'checkpoint', 'attempt'] as const) {
    await assertAtomicFailure(failOn);
  }

  const store = new InMemoryExportPersistenceStore({ projects: [project()] });
  const firstReservation = await reserve(store);
  const contender = await store.open().reserve({ ...reservation(), attemptId: 'attempt-2', leaseOwner: 'worker-b' });
  assert.equal(contender.kind, 'active', 'same active key should return the existing attempt');
  assert.equal(contender.attempt.id, firstReservation.attempt.id, 'same-key contender should point to the original attempt');
  assert.equal(store.commitInvocationCount, 0, 'reservation contention must not invoke commit');

  const delivery = await store.open().commit(commitInput());
  assert.equal(store.commitInvocationCount, 1, 'only the owning reservation may invoke one commit');
  assert.equal(delivery.attemptId, ATTEMPT_ID, 'delivery should be bound to the original attempt');

  const completed = await store.open().reserve({ ...reservation(), attemptId: 'attempt-3', leaseOwner: 'worker-c' });
  assert.equal(completed.kind, 'completed', 'same completed key should reuse the completed delivery');
  assert.deepEqual(completed.delivery, delivery, 'same completed key should return the original delivery');
  assert.equal(store.commitInvocationCount, 1, 'same completed key must not invoke a second commit');

  const freshRead = snapshot(store);
  assert.equal(freshRead.projects[0]?.status, 'export_ready', 'a fresh repository snapshot should expose committed project truth');
  assert.equal(freshRead.artifacts.filter((item) => item.kind === 'export_pptx').length, 1, 'a fresh repository snapshot should expose one ready PPTX');
  assert.equal(freshRead.checkpoints[0]?.stage, 'export_ready', 'a fresh repository snapshot should expose the committed checkpoint');
  assert.equal(freshRead.projects[0]?.latestCheckpointId, freshRead.checkpoints[0]?.checkpointId, 'a fresh repository snapshot should keep project/checkpoint linkage atomic');
  assert.equal(freshRead.attempts[0]?.status, 'completed', 'a fresh repository snapshot should expose the completed attempt');

  console.log('export persistence unit of work test: ok');
}

void main();
