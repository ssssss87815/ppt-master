import { strict as assert } from 'node:assert';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { applyImportSources } from '../backend/actions/import-sources.ts';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations.ts';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations.ts';
import { syncPreviewArtifacts, exportLocalPhase } from '../backend/orchestrator/phase-runner.ts';
import type {
  ImportSourcesAction,
  PrepareConfirmationsAction,
  SubmitConfirmationsAction,
} from '../backend/models/actions.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import type { ProjectRecord } from '../backend/models/projects.ts';
import { toProjectViewModel } from '../backend/services/project-view-service.ts';

function makeWorkspaceFixture(projectId: string): { workspacePath: string; cleanup: () => void } {
  const source = 'productization/test-fixtures/runtime-workspace';
  assert.ok(existsSync(source), `fixture source missing: ${source}`);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ppt-workbench-ui-slice-'));
  const workspacePath = path.join(tempRoot, projectId);
  cpSync(source, workspacePath, { recursive: true });
  return {
    workspacePath,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function main() {
  const fixture = makeWorkspaceFixture('pptmaster-demo-project');
  try {
    const project: ProjectRecord = {
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

    const importAction: ImportSourcesAction = {
      type: 'import_sources',
      payload: {
        projectId: project.projectId,
        sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
      },
    };
    const imported = applyImportSources(project, importAction, '2026-06-30T16:05:00.000Z');
    const importedView = toProjectViewModel(imported.project, imported.artifacts, []);

    assert.equal(importedView.status, 'sources_ready', 'imported view should reflect current source-ready status');
    assert.equal(importedView.workbench.sections[0]?.key, 'sources', 'workbench should expose source section first');
    assert.equal(importedView.workbench.sections[0]?.status, 'complete', 'source section should be complete after import');
    assert.equal(importedView.workbench.confirmationState.hasRecommendations, false, 'confirmation state should be false before recommendations');

    const prepareAction: PrepareConfirmationsAction = {
      type: 'prepare_confirmations',
      payload: { projectId: project.projectId },
    };
    const prepared = applyPrepareConfirmations(imported.project, imported.artifacts, prepareAction, '2026-06-30T16:10:00.000Z');
    const preparedArtifacts = [...imported.artifacts, prepared.artifact];
    const preparedView = toProjectViewModel(prepared.project, preparedArtifacts, prepared.recommendations, prepared.checkpoint);

    assert.equal(preparedView.status, 'confirmation_pending', 'prepared view should advance to confirmation_pending');
    assert.equal(preparedView.workbench.confirmationState.hasRecommendations, true, 'confirmation state should report recommendations');
    assert.equal(preparedView.workbench.confirmationSubmission?.status, 'ready', 'confirmation submission should be ready after preparation');
    assert.equal(preparedView.workbench.confirmationSubmission?.questions.length, 8, 'confirmation submission should expose eight questions');
    assert.equal(preparedView.workbench.sections.find((item) => item.key === 'confirmations')?.action, 'submit_confirmations', 'confirmation section action should surface submit CTA');

    const submitAction: SubmitConfirmationsAction = {
      type: 'submit_confirmations',
      payload: {
        projectId: project.projectId,
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
    const submitted = applySubmitConfirmations(prepared.project, submitAction, '2026-06-30T16:15:00.000Z');
    const postLockArtifacts = [...preparedArtifacts, ...submitted.artifacts] as ProductArtifactRef[];
    const postLockView = toProjectViewModel(submitted.project, postLockArtifacts, prepared.recommendations, submitted.checkpoint);

    assert.equal(postLockView.status, 'spec_ready', 'post-lock view should advance to spec_ready only after the strategist runtime bridge materializes a ready design spec and locked spec lock');
    assert.equal(postLockView.workbench.confirmationSubmission?.status, 'submitted', 'confirmation submission should show submitted after lock');
    assert.match(postLockView.workbench.confirmationSubmission?.bannerText ?? '', /locked and ready/i, 'submitted banner should describe strategist handoff readiness');
    assert.ok((postLockView.artifactSummary?.byKind.design_spec ?? 0) >= 1, 'artifact summary should count materialized strategist design_spec artifacts');

    const previewed = syncPreviewArtifacts(
      {
        ...submitted.project,
        status: 'generation_in_progress',
        updatedAt: '2026-06-30T16:20:00.000Z',
        lastRunId: 'pptmaster-demo-project-run-1751300700000',
      },
      '2026-06-30T16:25:00.000Z',
    );
    const previewView = toProjectViewModel(previewed.project, [...postLockArtifacts, ...previewed.artifacts], prepared.recommendations, previewed.checkpoints[0]);

    assert.equal(previewView.status, 'preview_available', 'preview view should advance to preview_available');
    assert.equal(previewView.workbench.sections.find((item) => item.key === 'preview')?.status, 'complete', 'preview section should be complete once preview is available');
    assert.ok((previewView.preview?.items ?? []).some((item) => item.role === 'page'), 'preview view should surface preview page items');

    const exported = exportLocalPhase(previewed.project, '2026-06-30T16:40:00.000Z');
    const exportView = toProjectViewModel(exported.project, [...postLockArtifacts, ...previewed.artifacts, ...exported.artifacts], prepared.recommendations, exported.checkpoints[0]);

    assert.equal(exportView.status, 'export_ready', 'export view should advance to export_ready');
    assert.equal(exportView.workbench.sections.find((item) => item.key === 'export')?.status, 'complete', 'export section should become complete once export artifacts exist');
    assert.ok((exportView.export?.latestExportUrl ?? '').endsWith('.pptx'), 'export view should expose pptx url');
    assert.ok((exportView.export?.companionStorageKeys ?? []).some((key) => key.endsWith('.md')), 'export view should expose markdown companion');

    console.log('project workbench ui slice test: ok');
  } finally {
    fixture.cleanup();
  }
}

main();
