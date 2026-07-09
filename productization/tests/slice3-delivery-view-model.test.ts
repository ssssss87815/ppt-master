import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { exportLocalPhase, runResumeGeneration, runStartGeneration, syncPreviewArtifacts } from '../backend/orchestrator/phase-runner';
import { requestRevision } from '../backend/orchestrator/phase-runner';
import { toProjectViewModel } from '../backend/services/project-view-service';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';

function makeWorkspaceFixture(): { workspacePath: string; cleanup: () => void } {
  const source = '/tmp/ppt-downstream-svg-probe';
  assert.ok(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-slice3-delivery-view-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function createVerifiedStrategistArtifacts(project: ProjectRecord): ProductArtifactRef[] {
  return [
    {
      artifactId: `${project.projectId}-design-spec`,
      projectId: project.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'ready',
      label: 'Strategist design specification',
      storageKey: `${project.workspace.workspacePath}/design_spec.md`,
      mimeType: 'text/markdown',
      metadata: {
        role: 'strategist_output',
        verification: 'verified_runtime_bridge',
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
    {
      artifactId: `${project.projectId}-spec-lock`,
      projectId: project.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'locked',
      label: 'Executor entry spec lock',
      storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
      mimeType: 'text/markdown',
      metadata: {
        role: 'strategist_output',
        verification: 'verified_runtime_bridge',
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
  ];
}

function main() {
  const fixture = makeWorkspaceFixture();
  try {
    const specReadyProject: ProjectRecord = {
      projectId: 'pptmaster-slice3-project',
      name: 'PPTMASTER Slice 3 Project',
      status: 'spec_ready',
      workspace: {
        projectId: 'pptmaster-slice3-project',
        workspacePath: fixture.workspacePath,
      },
      latestCheckpointId: 'pptmaster-slice3-project-checkpoint-spec-ready',
      createdAt: '2026-07-07T11:00:00.000Z',
      updatedAt: '2026-07-07T11:00:00.000Z',
    };

    const verifiedStrategistArtifacts = createVerifiedStrategistArtifacts(specReadyProject);
    const started = runStartGeneration(specReadyProject, verifiedStrategistArtifacts, '2026-07-07T11:05:00.000Z');
    const previewed = syncPreviewArtifacts(started.project, '2026-07-07T11:05:30.000Z');
    const revision = requestRevision(
      previewed.project,
      'Tighten the market sizing section and simplify slide 3.',
      '2026-07-07T11:10:00.000Z',
    );
    const resumed = runResumeGeneration(revision.project, '2026-07-07T11:15:00.000Z');
    const repreviewed = syncPreviewArtifacts(resumed.project, '2026-07-07T11:15:30.000Z');
    const exported = exportLocalPhase(repreviewed.project, '2026-07-07T11:20:00.000Z');

    const allArtifacts: ProductArtifactRef[] = [
      ...verifiedStrategistArtifacts,
      ...started.artifacts,
      ...previewed.artifacts,
      ...revision.artifacts,
      ...resumed.artifacts,
      ...repreviewed.artifacts,
      ...exported.artifacts,
    ];

    const allCheckpoints = [
      ...started.checkpoints,
      ...previewed.checkpoints,
      ...revision.checkpoints,
      ...resumed.checkpoints,
      ...repreviewed.checkpoints,
      ...exported.checkpoints,
    ];

    const viewModel = toProjectViewModel(
      exported.project,
      allArtifacts,
      [],
      exported.checkpoints[0],
      allCheckpoints[0],
    );

    assert.equal(viewModel.status, 'export_ready', 'delivery view should expose export_ready status');
    assert.equal(viewModel.nextActions.length, 0, 'export_ready should not suggest additional workflow actions');
    assert.ok(
      viewModel.workbench.sections.some((section) => section.key === 'export' && section.status === 'complete'),
      'export section should be surfaced as complete at delivery time',
    );
    assert.ok(
      (viewModel.export?.latestExportUrl ?? '').endsWith('.pptx'),
      'delivery view should expose pptx export url',
    );
    assert.ok(
      (viewModel.export?.companionStorageKeys ?? []).some((key) => key.endsWith('.md')),
      'delivery view should expose markdown companion storage key',
    );
    assert.ok(
      (viewModel.export?.companionStorageKeys ?? []).some((key) => key.endsWith('/image_manifest.json')),
      'delivery view should expose image manifest companion storage key',
    );
    assert.ok((viewModel.artifactSummary?.byKind?.export_pptx ?? 0) >= 1, 'artifact summary should count export_pptx artifacts');
    assert.equal(viewModel.latestCheckpoint?.stage, 'export_ready', 'delivery view should surface the export_ready checkpoint');

    console.log('slice-3 delivery view-model test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
