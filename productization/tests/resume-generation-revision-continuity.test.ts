import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { requestRevision, runPreviewSync, runResumeGeneration } from '../backend/adapter/phase-runner';
import { runLocalResumePhase } from '../backend/orchestrator/workflow-orchestrator';
import type { ProjectRecord } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';

type Assert = (condition: boolean, message: string) => void;

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = 'productization/test-fixtures/runtime-workspace';
  assert(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-resume-revision-continuity-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  const fixture = makeWorkspaceFixture();
  try {
    const previewReadyProject: ProjectRecord = {
      projectId: 'pptmaster-demo-project',
      name: 'PPTMASTER Demo Project',
      status: 'generation_in_progress',
      workspace: {
        projectId: 'pptmaster-demo-project',
        workspacePath: fixture.workspacePath,
      },
      lastRunId: 'pptmaster-demo-project-run-1751300700000',
      createdAt: '2026-06-30T16:00:00.000Z',
      updatedAt: '2026-06-30T16:20:00.000Z',
    };

    const previewed = runPreviewSync(previewReadyProject, '2026-06-30T16:25:00.000Z');
    const revised = requestRevision(previewed.project, 'Tighten page 1 headline', '2026-06-30T16:30:00.000Z');

    const resumed = runResumeGeneration(revised.project, '2026-06-30T16:35:00.000Z');
    assert(resumed.project.status === 'generation_in_progress', 'resume should move back to generation_in_progress');
    assert(
      resumed.project.latestRevisionRequestId === revised.project.latestRevisionRequestId,
      'resume should preserve latestRevisionRequestId on project state',
    );
    assert(
      resumed.checkpoints[0]?.artifactIds.includes(revised.project.latestRevisionRequestId ?? ''),
      'resume checkpoint should retain the triggering revision id in artifactIds',
    );

    const resumedView = toProjectViewModel(revised.project, revised.artifacts, [], resumed.checkpoints[0]);
    assert(resumedView.latestCheckpoint?.checkpointId === resumed.checkpoints[0]?.checkpointId, 'revision view should surface supplied resume checkpoint payload');
    assert(resumedView.latestCheckpoint?.createdAt === resumed.checkpoints[0]?.createdAt, 'revision view should surface resume checkpoint createdAt when resume checkpoint payload is supplied');
    assert(
      resumedView.nextActions.length === 1 && resumedView.nextActions[0] === 'resume_generation',
      'revision_requested view should advertise the resume recovery action in the projected nextActions list',
    );

    const localResumed = runLocalResumePhase(revised.project, '2026-06-30T16:35:00.000Z');
    assert(localResumed.resumed.project.status === 'generation_in_progress', 'local resume should preserve generation-in-progress state after the first SVG authoring probe');
    assert(localResumed.previewed.project.status === 'preview_available', 'local resume should reach preview after a second same-timestamp SVG authoring probe');
    assert(
      localResumed.previewed.artifacts.filter((artifact) => artifact.metadata?.verification === 'runtime_svg_authoring_probe').length === 1,
      'local resume preview handoff should include live SVG authoring probe evidence',
    );

    console.log('resume generation revision continuity test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
