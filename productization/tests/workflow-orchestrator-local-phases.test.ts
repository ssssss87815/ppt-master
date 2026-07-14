type Assert = (condition: boolean, message: string) => void;

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runLocalExportPhase, runLocalGenerationPhase, runLocalResumePhase, runLocalRevisionPhase } from '../backend/orchestrator/workflow-orchestrator';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function baseProject(status: ProjectRecord['status'], workspacePath: string): ProjectRecord {
  return {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status,
    workspace: {
      projectId: 'pptmaster-demo-project',
      workspacePath,
    },
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:15:00.000Z',
  };
}

function strategistArtifacts(project: ProjectRecord): ProductArtifactRef[] {
  const createdAt = project.updatedAt;
  const runId = project.lastRunId;
  return [
    {
      artifactId: `${project.projectId}-confirmation-result`, projectId: project.projectId, kind: 'confirmation_result',
      scope: 'project', status: 'ready', runId, storageKey: `${project.workspace.workspacePath}/confirmations/result.json`,
      metadata: { lockedAt: createdAt }, createdAt, updatedAt: createdAt,
    },
    {
      artifactId: `${project.projectId}-design-spec`, projectId: project.projectId, kind: 'design_spec',
      scope: 'project', status: 'ready', runId, storageKey: `${project.workspace.workspacePath}/design_spec.md`,
      metadata: { verification: 'materialized_from_locked_confirmations' }, createdAt, updatedAt: createdAt,
    },
    {
      artifactId: `${project.projectId}-spec-lock`, projectId: project.projectId, kind: 'spec_lock',
      scope: 'project', status: 'locked', runId, storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
      metadata: { verification: 'materialized_from_locked_confirmations' }, createdAt, updatedAt: createdAt,
    },
  ];
}

function makeWorkspaceFixture(projectId: string): { workspacePath: string; cleanup: () => void } {
  const source = path.resolve('productization/test-fixtures/runtime-workspace');
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-orchestrator-local-phases-'));
  const workspacePath = path.join(tempRoot, projectId);
  cpSync(source, workspacePath, { recursive: true });

  const svgDir = path.join(workspacePath, 'svg_output');
  writeFileSync(path.join(svgDir, '01_cover.svg'), '<svg><rect id="bg" width="10" height="10" fill="#ffffff"/></svg>', 'utf8');
  writeFileSync(path.join(svgDir, '02_body.svg'), '<svg><circle id="dot" cx="5" cy="5" r="2" fill="#000000"/></svg>', 'utf8');

  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  const fixture = makeWorkspaceFixture('pptmaster-demo-project');

  try {
    const specReadyProject = {
      ...baseProject('spec_ready', fixture.workspacePath),
      lastRunId: 'pptmaster-demo-project-strategist-1',
    };
    const generated = runLocalGenerationPhase(
      specReadyProject,
      '2026-06-30T16:20:00.000Z',
      strategistArtifacts(specReadyProject),
    );
    assert(generated.started.project.status === 'generation_in_progress', 'local generation should start generation');
    assert(generated.started.project.status === 'generation_in_progress', 'local generation start should expose the generation-in-progress project state for orchestration consumers');

    const generatedStartView = toProjectViewModel(
      generated.started.project,
      generated.started.artifacts,
      [],
      undefined,
      generated.started.checkpoints[0],
    );
    assert(generatedStartView.lastStartedCheckpoint?.stage === 'generation_started', 'local generation view should surface last started checkpoint stage');
    assert(generatedStartView.lastStartedCheckpoint?.stageTitle === 'Generation Started', 'local generation view should surface last started checkpoint stage title');
    assert(generatedStartView.lastStartedCheckpoint?.status === 'completed', 'local generation view should surface latest available start-marker checkpoint status');
    assert(generatedStartView.lastStartedCheckpoint?.statusTitle === 'Completed', 'local generation view should surface latest available start-marker checkpoint status title');
    assert(generatedStartView.lastStartedCheckpoint?.note === 'Generation phase entered via runtime workspace evidence plus live SVG authoring mutation probe.', 'local generation view should surface runtime-backed start-marker checkpoint note');
    assert(generatedStartView.lastStartedCheckpoint?.createdAt === '2026-06-30T16:20:00.000Z', 'local generation view should surface start-marker createdAt');
    assert(generatedStartView.lastStartedCheckpoint?.storageKey?.endsWith(`${generated.started.checkpoints[0]?.checkpointId}.json`) ?? false, 'local generation view should surface start-marker storage key');
    assert(generated.previewed.project.status === 'preview_available', 'local generation should end at preview_available');
    assert(generated.previewed.artifacts.some((item) => item.kind === 'preview_bundle'), 'local generation should emit preview bundle');

    const revisioned = runLocalRevisionPhase(
      {
        ...generated.previewed.project,
        lastRunId: 'pptmaster-demo-project-run-1751300400000',
      },
      'Tighten page 1 headline',
      '2026-06-30T16:22:00.000Z',
    );
    assert(revisioned.project.status === 'revision_requested', 'local revision should move into revision_requested');
    assert(revisioned.revisions[0]?.revisionId === revisioned.project.latestRevisionRequestId, 'local revision should persist latest revision id');

    const resumed = runLocalResumePhase(
      {
        ...baseProject('revision_requested', fixture.workspacePath),
        latestRevisionRequestId: revisioned.project.latestRevisionRequestId,
        lastRunId: 'pptmaster-demo-project-run-1751300400000',
      },
      '2026-06-30T16:25:00.000Z',
    );
    assert(resumed.resumed.project.status === 'generation_in_progress', 'local resume should restart generation');
    assert(resumed.previewed.project.status === 'preview_available', 'local resume should re-enter preview_available');
    assert(
      resumed.previewed.artifacts
        .filter((item) => item.kind !== 'workflow_checkpoint')
        .every((item) => item.runId === 'pptmaster-demo-project-run-1751300400000'),
      'local resume should preserve existing run id into preview artifacts',
    );

    let localExportRejected = false;
    try {
      runLocalExportPhase(generated.previewed.project, '2026-06-30T16:27:00.000Z');
    } catch (error) {
      localExportRejected = error instanceof Error
        && error.message.includes('local export is not a delivery path');
    }
    assert(localExportRejected, 'local export must fail closed instead of bypassing verified staged delivery');

    console.log('workflow orchestrator local phases test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
