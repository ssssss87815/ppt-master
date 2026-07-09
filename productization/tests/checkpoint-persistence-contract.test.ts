type Assert = (condition: boolean, message: string) => void;

import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applyImportSources } from '../backend/actions/import-sources';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations';
import { exportLocalPhase, runStartGeneration, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner';
import type {
  ImportSourcesAction,
  PrepareConfirmationsAction,
  SubmitConfirmationsAction,
} from '../backend/models/actions';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects';

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function assertLatestCheckpoint(
  project: ProjectRecord,
  checkpoint: WorkflowCheckpoint,
  artifacts: ProductArtifactRef[],
  expectedArtifactIds: string[],
  expectedCreatedAt?: string,
  options: { requireCheckpointArtifact?: boolean; expectedProjectCheckpointId?: string } = {},
) {
  const expectedProjectCheckpointId = options.expectedProjectCheckpointId ?? checkpoint.checkpointId;
  assert(project.latestCheckpointId === expectedProjectCheckpointId, 'project should expose the truthful latestCheckpointId');
  if (options.requireCheckpointArtifact ?? true) {
    assert(
      artifacts.some((item) => item.kind === 'workflow_checkpoint' && item.artifactId === checkpoint.checkpointId),
      'workflow checkpoint artifact should exist for latest checkpoint',
    );
    const checkpointArtifact = artifacts.find((item) => item.artifactId === checkpoint.checkpointId);
    assert(
      Boolean(checkpointArtifact?.storageKey?.endsWith(`/checkpoints/${checkpoint.checkpointId}.json`)),
      'checkpoint artifact storageKey should match checkpoint id',
    );
  }
  assert(
    JSON.stringify(checkpoint.artifactIds) === JSON.stringify(expectedArtifactIds),
    'checkpoint should preserve artifact ids',
  );
  if (expectedCreatedAt) {
    assert(checkpoint.createdAt === expectedCreatedAt, 'checkpoint should preserve createdAt');
  }
}

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = '/tmp/ppt-downstream-svg-probe';
  assert(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-checkpoint-persistence-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  const fixture = makeWorkspaceFixture();
  const baseProject: ProjectRecord = {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-demo-project',
      workspacePath: fixture.workspacePath,
    },
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:00:00.000Z',
  };

  try {

  const importAction: ImportSourcesAction = {
    type: 'import_sources',
    payload: {
      projectId: baseProject.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  };
  const imported = applyImportSources(baseProject, importAction, '2026-06-30T16:05:00.000Z');
  assertLatestCheckpoint(
    imported.project,
    imported.checkpoint,
    imported.artifacts,
    imported.artifacts.filter((item) => item.kind !== 'workflow_checkpoint').map((item) => item.artifactId),
    '2026-06-30T16:05:00.000Z',
  );

  const prepareAction: PrepareConfirmationsAction = {
    type: 'prepare_confirmations',
    payload: { projectId: baseProject.projectId },
  };
  const prepared = applyPrepareConfirmations(
    imported.project,
    imported.artifacts,
    prepareAction,
    '2026-06-30T16:10:00.000Z',
  );
  const preparedCheckpointArtifacts = [
    ...imported.artifacts.filter((item) => item.kind === 'workflow_checkpoint'),
    {
      artifactId: prepared.checkpoint.checkpointId,
      projectId: prepared.project.projectId,
      kind: 'workflow_checkpoint' as const,
      scope: 'project' as const,
      status: 'ready' as const,
      storageKey: `${prepared.project.workspace.workspacePath}/checkpoints/${prepared.checkpoint.checkpointId}.json`,
      createdAt: prepared.checkpoint.createdAt,
      updatedAt: prepared.checkpoint.createdAt,
    },
  ];
  assertLatestCheckpoint(
    prepared.project,
    prepared.checkpoint,
    [prepared.artifact, ...preparedCheckpointArtifacts],
    [prepared.artifact.artifactId],
    '2026-06-30T16:10:00.000Z',
    { expectedProjectCheckpointId: prepared.checkpoint.checkpointId },
  );

  const submitAction: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: baseProject.projectId,
      answers: {
        audience: 'Founders',
        goal: 'Raise seed round',
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
    },
  };
  const submitted = applySubmitConfirmations(
    prepared.project,
    submitAction,
    '2026-06-30T16:15:00.000Z',
  );
  assertLatestCheckpoint(
    submitted.project,
    submitted.checkpoint,
    submitted.artifacts,
    submitted.artifacts.filter((item) => item.kind !== 'workflow_checkpoint').map((item) => item.artifactId),
    '2026-06-30T16:15:00.000Z',
    { expectedProjectCheckpointId: submitted.checkpoint.checkpointId, requireCheckpointArtifact: false },
  );

  const started = runStartGeneration(submitted.project, submitted.artifacts, '2026-06-30T16:20:00.000Z');
  assertLatestCheckpoint(
    started.project,
    started.checkpoints[0],
    started.artifacts,
    started.artifacts.map((item) => item.artifactId),
    '2026-06-30T16:20:00.000Z',
    { requireCheckpointArtifact: false },
  );

  const previewed = syncPreviewArtifacts(started.project, '2026-06-30T16:25:00.000Z');
  assertLatestCheckpoint(
    previewed.project,
    previewed.checkpoints[0],
    previewed.artifacts,
    previewed.checkpoints[0]?.artifactIds ?? [],
    '2026-06-30T16:25:00.000Z',
    { requireCheckpointArtifact: false },
  );

  const exported = exportLocalPhase(previewed.project, '2026-06-30T16:30:00.000Z');
  assertLatestCheckpoint(
    exported.project,
    exported.checkpoints[0],
    exported.artifacts,
    exported.checkpoints[0]?.artifactIds ?? [],
    '2026-06-30T16:30:00.000Z',
    { requireCheckpointArtifact: false },
  );

  console.log('checkpoint persistence contract test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
