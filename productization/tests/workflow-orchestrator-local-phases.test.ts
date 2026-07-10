type Assert = (condition: boolean, message: string) => void;

import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runLocalExportPhase, runLocalGenerationPhase, runLocalResumePhase, runLocalRevisionPhase } from '../backend/orchestrator/workflow-orchestrator';
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

function makeWorkspaceFixture(projectId: string): { workspacePath: string; cleanup: () => void } {
  const candidates = [
    path.resolve('projects/low_carbon_life_ppt169_20260630'),
    path.resolve('projects/low-carbon-living-science_ppt169_20260630'),
  ];
  const source = candidates.find(
    (candidate) =>
      existsSync(path.join(candidate, 'spec_lock.md')) &&
      existsSync(path.join(candidate, 'design_spec.md')),
  );

  if (!source) {
    throw new Error('No runtime-backed workspace fixture found for local phase orchestration test.');
  }

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
    const specReadyProject = baseProject('spec_ready', fixture.workspacePath);
    const generated = runLocalGenerationPhase(specReadyProject, '2026-06-30T16:20:00.000Z');
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

    const exported = runLocalExportPhase(generated.previewed.project, '2026-06-30T16:27:00.000Z');
    assert(exported.project.status === 'export_ready', 'local export should move into export_ready');
    assert(exported.artifacts.some((item) => item.kind === 'export_pptx'), 'local export should emit an export artifact');

    console.log('workflow orchestrator local phases test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
