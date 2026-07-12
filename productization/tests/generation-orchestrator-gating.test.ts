type Assert = (condition: boolean, message: string) => void;

import { runStartGeneration } from '../backend/orchestrator/phase-runner';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';

const assert: Assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function projectFor(runId?: string): ProjectRecord {
  return {
    projectId: 'pptmaster-generation-gated-project',
    name: 'PPTMASTER Generation Gated Project',
    status: 'spec_ready',
    workspace: {
      projectId: 'pptmaster-generation-gated-project',
      workspacePath: 'projects/pptmaster-generation-gated-project',
    },
    latestCheckpointId: 'pptmaster-generation-gated-project-checkpoint-spec-ready',
    lastRunId: runId,
    createdAt: '2026-07-08T01:00:00.000Z',
    updatedAt: '2026-07-08T01:00:00.000Z',
  };
}

function verifiedArtifacts(project: ProjectRecord, runId = project.lastRunId): ProductArtifactRef[] {
  const createdAt = project.updatedAt;
  return [
    {
      artifactId: `${project.projectId}-confirmation-result`, projectId: project.projectId, kind: 'confirmation_result',
      scope: 'project', status: 'ready', runId, storageKey: `${project.workspace.workspacePath}/confirmations/result.json`,
      metadata: { lockedAt: createdAt }, createdAt, updatedAt: createdAt,
    },
    {
      artifactId: `${project.projectId}-design-spec`, projectId: project.projectId, kind: 'design_spec',
      scope: 'project', status: 'ready', runId, storageKey: `${project.workspace.workspacePath}/design_spec.md`,
      metadata: { role: 'strategist_output', verification: 'materialized_from_locked_confirmations' }, createdAt, updatedAt: createdAt,
    },
    {
      artifactId: `${project.projectId}-spec-lock`, projectId: project.projectId, kind: 'spec_lock',
      scope: 'project', status: 'locked', runId, storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
      metadata: { role: 'strategist_output', verification: 'materialized_from_locked_confirmations' }, createdAt, updatedAt: createdAt,
    },
  ];
}

function assertRejected(project: ProjectRecord, artifacts: ProductArtifactRef[], label: string): void {
  let error: unknown;
  try {
    runStartGeneration(project, artifacts, '2026-07-08T01:05:00.000Z');
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, `${label} should be rejected before generation`);
  assert(
    error instanceof Error && /verified strategist outputs with same-run eligibility/i.test(error.message),
    `${label} should explain the same-run strategist gate`,
  );
}

function main() {
  const project = projectFor('pptmaster-generation-gated-project-strategist-1');
  const artifacts = verifiedArtifacts(project);

  assertRejected(project, [], 'missing artifacts');
  assertRejected(projectFor(), artifacts, 'spec_ready project without a strategist run identity');
  assertRejected(project, verifiedArtifacts(project, 'stale-strategist-run'), 'cross-run artifacts');
  assertRejected(
    project,
    artifacts.map((artifact) => artifact.kind === 'design_spec' ? { ...artifact, status: 'superseded' } : artifact),
    'superseded artifacts',
  );
  assertRejected(
    project,
    artifacts.map((artifact) => artifact.kind === 'spec_lock'
      ? { ...artifact, metadata: { ...artifact.metadata, verification: 'unverified_runtime_bridge' } }
      : artifact),
    'unverified runtime evidence',
  );
  assertRejected(
    project,
    artifacts.map((artifact) => artifact.kind === 'confirmation_result'
      ? { ...artifact, metadata: {} }
      : artifact),
    'unlocked confirmation result',
  );

  for (const status of ['failed', 'pending', 'planned'] as const) {
    for (const kind of ['design_spec', 'spec_lock'] as const) {
      assertRejected(
        project,
        artifacts.map((artifact) => artifact.kind === kind ? { ...artifact, status } : artifact),
        `${kind} is ${status}, so runtime generation cannot start`,
      );
    }
  }

  console.log('generation orchestrator same-run negative gating test: ok');
}

main();
