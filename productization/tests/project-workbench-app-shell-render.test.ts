import assert from 'node:assert/strict';

import { applyImportSources } from '../backend/actions/import-sources.ts';
import { applyPrepareConfirmations } from '../backend/actions/prepare-confirmations.ts';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations.ts';
import type {
  ImportSourcesAction,
  PrepareConfirmationsAction,
  SubmitConfirmationsAction,
} from '../backend/models/actions.ts';
import type { ProjectRecord } from '../backend/models/projects.ts';
import type { ProductArtifactRef } from '../backend/models/artifacts.ts';
import { toProjectViewModel } from '../backend/services/project-view-service.ts';
import { renderProjectWorkbenchShell } from '../app/render-project-workbench-shell.ts';
import type { ProjectViewModel } from '../app/viewmodels/project-view-model.ts';

function createPreparedShell() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-app-shell-project',
    name: 'PPTMASTER App Shell Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-app-shell-project',
      workspacePath: 'projects/pptmaster-app-shell-project',
    },
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
  };

  const importAction: ImportSourcesAction = {
    type: 'import_sources',
    payload: {
      projectId: project.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  };
  const imported = applyImportSources(project, importAction, '2026-07-09T12:05:00.000Z');

  const checkpoint = {
    checkpointId: 'checkpoint-confirmations-prepared-001',
    projectId: project.projectId,
    stage: 'confirmations_prepared' as const,
    status: 'completed' as const,
    statusBefore: 'sources_ready' as const,
    statusAfter: 'confirmation_pending' as const,
    artifactIds: ['pptmaster-app-shell-project-source-1'],
    note: 'Prepared confirmation recommendations from imported source intake.',
    createdAt: '2026-07-09T12:06:00.000Z',
  };

  const prepareAction: PrepareConfirmationsAction = {
    type: 'prepare_confirmations',
    payload: { projectId: project.projectId },
  };
  const prepared = applyPrepareConfirmations(imported.project, imported.artifacts, prepareAction, '2026-07-09T12:10:00.000Z');

  return toProjectViewModel(
    prepared.project,
    [...imported.artifacts, prepared.artifact],
    prepared.recommendations,
    undefined,
    checkpoint,
  );
}

function makeArtifactRichShellView(): ProjectViewModel {
  const strategistArtifacts: ProductArtifactRef[] = [
    {
      artifactId: 'pptmaster-app-shell-artifact-project-design-spec',
      projectId: 'pptmaster-app-shell-artifact-project',
      kind: 'design_spec',
      scope: 'project',
      status: 'pending',
      label: 'Strategist design spec (unverified)',
      storageKey: 'projects/pptmaster-app-shell-artifact-project/design_spec.md',
      mimeType: 'text/markdown',
      metadata: {
        verification: 'unverified_runtime_bridge',
      },
      createdAt: '2026-07-09T12:28:00.000Z',
      updatedAt: '2026-07-09T12:28:00.000Z',
    },
    {
      artifactId: 'pptmaster-app-shell-artifact-project-spec-lock',
      projectId: 'pptmaster-app-shell-artifact-project',
      kind: 'spec_lock',
      scope: 'project',
      status: 'pending',
      label: 'Strategist spec lock (unverified)',
      storageKey: 'projects/pptmaster-app-shell-artifact-project/spec_lock.md',
      mimeType: 'text/markdown',
      metadata: {
        verification: 'unverified_runtime_bridge',
      },
      createdAt: '2026-07-09T12:28:00.000Z',
      updatedAt: '2026-07-09T12:28:00.000Z',
    },
  ];

  return {
    projectId: 'pptmaster-app-shell-artifact-project',
    name: 'PPTMASTER App Shell Artifact Project',
    status: 'export_ready',
    title: 'Export ready',
    description: 'Preview and export assets are available for delivery.',
    workspacePath: 'projects/pptmaster-app-shell-artifact-project',
    currentPhase: {
      status: 'export_ready',
      title: 'Export ready',
      description: 'Preview and export assets are available for delivery.',
    },
    timeline: [],
    nextActions: ['export_pptx'],
    latestPreviewUrl: '/projects/pptmaster-app-shell-artifact-project/preview/index.json',
    latestExportUrl: '/projects/pptmaster-app-shell-artifact-project/exports/demo.pptx',
    preview: {
      latestPreviewUrl: '/projects/pptmaster-app-shell-artifact-project/preview/index.json',
      manifestStorageKey: 'projects/pptmaster-app-shell-artifact-project/preview/index.json',
      pageCount: 2,
      pageArtifactIds: ['pptmaster-app-shell-artifact-project-page-1', 'pptmaster-app-shell-artifact-project-page-2'],
      items: [
        {
          artifactId: 'pptmaster-app-shell-artifact-project-preview-bundle',
          kind: 'preview_bundle',
          title: 'Preview bundle manifest',
          storageKey: 'projects/pptmaster-app-shell-artifact-project/preview/index.json',
          filename: 'index.json',
          mimeType: 'application/json',
          role: 'bundle',
        },
        {
          artifactId: 'pptmaster-app-shell-artifact-project-page-1',
          kind: 'preview_page_svg',
          title: 'Preview page page-1',
          storageKey: 'projects/pptmaster-app-shell-artifact-project/svg_output/01_cover.svg',
          filename: '01_cover.svg',
          mimeType: 'image/svg+xml',
          role: 'page',
          pageKey: 'page-1',
        },
        {
          artifactId: 'pptmaster-app-shell-artifact-project-page-2',
          kind: 'preview_page_svg',
          title: 'Preview page page-2',
          storageKey: 'projects/pptmaster-app-shell-artifact-project/svg_output/02_story.svg',
          filename: '02_story.svg',
          mimeType: 'image/svg+xml',
          role: 'page',
          pageKey: 'page-2',
        },
      ],
    },
    export: {
      latestExportUrl: '/projects/pptmaster-app-shell-artifact-project/exports/demo.pptx',
      latestExportLabel: 'PPTX export',
      format: 'pptx',
      filename: 'demo.pptx',
      artifactCount: 3,
      companionCount: 2,
      companionStorageKeys: [
        'projects/pptmaster-app-shell-artifact-project/exports/demo.md',
        'projects/pptmaster-app-shell-artifact-project/exports/demo_files/image_manifest.json',
      ],
      assetDirectoryStorageKey: 'projects/pptmaster-app-shell-artifact-project/exports/demo_files',
      runId: 'run-export-001',
    },
    delivery: {
      primaryArtifactId: 'pptmaster-app-shell-artifact-project-export-pptx',
      primaryStorageKey: 'projects/pptmaster-app-shell-artifact-project/exports/demo.pptx',
      primaryLabel: 'PPTX export',
      companionArtifactIds: ['pptmaster-app-shell-artifact-project-export-md', 'pptmaster-app-shell-artifact-project-image-manifest'],
      companionStorageKeys: [
        'projects/pptmaster-app-shell-artifact-project/exports/demo.md',
        'projects/pptmaster-app-shell-artifact-project/exports/demo_files/image_manifest.json',
      ],
      assetDirectoryStorageKey: 'projects/pptmaster-app-shell-artifact-project/exports/demo_files',
      runId: 'run-export-001',
      items: [
        {
          artifactId: 'pptmaster-app-shell-artifact-project-export-pptx',
          kind: 'export_pptx',
          title: 'PPTX export',
          storageKey: 'projects/pptmaster-app-shell-artifact-project/exports/demo.pptx',
          filename: 'demo.pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          role: 'primary',
        },
        {
          artifactId: 'pptmaster-app-shell-artifact-project-export-md',
          kind: 'runtime_log',
          title: 'Runtime log',
          storageKey: 'projects/pptmaster-app-shell-artifact-project/exports/demo.md',
          filename: 'demo.md',
          mimeType: 'text/markdown',
          role: 'companion',
        },
      ],
    },
    workbench: {
      strategistHandoff: {
        gateStatus: 'pending_runtime_verification',
        summary: 'Design spec and spec lock exist, but runtime bridge verification is still pending.',
        detail: 'Keep generation blocked until both strategist handoff artifacts clear runtime verification. The product shell should not treat file presence alone as enough proof.',
        panelStatus: 'warning',
        verificationBadgeTone: 'warning',
        verificationBadgeText: 'Pending runtime bridge verification',
        gateLabel: 'Verification pending',
        verifiedArtifactCount: 0,
        pendingArtifactCount: 2,
        generationGateCopy: 'Generation handoff locked: wait for runtime bridge verification before starting page generation.',
        artifacts: strategistArtifacts.map((artifact) => ({
          artifactId: artifact.artifactId,
          kind: artifact.kind as 'design_spec' | 'spec_lock',
          label: artifact.label,
          status: artifact.status,
          verificationState: 'pending_runtime_verification' as const,
          storageKey: artifact.storageKey,
        })),
      },
      sections: [
        {
          key: 'confirmations',
          title: 'Confirmation status',
          status: 'complete',
          summary: 'All confirmations locked.',
        },
        {
          key: 'preview',
          title: 'Preview',
          status: 'complete',
          summary: 'Sync preview from workspace SVG outputs.',
        },
        {
          key: 'export',
          title: 'Delivery Export',
          status: 'complete',
          summary: 'Produce final PPTX and companion artifacts.',
        },
      ],
      confirmationState: {
        recommendationCount: 8,
        answeredCount: 8,
        locked: true,
        displayStatus: 'completed',
      },
      summaryCards: [
        { key: 'preview', title: 'Preview', value: '2 page(s)', tone: 'success' },
        { key: 'strategist', title: 'Strategist', value: 'Pending runtime verification', tone: 'warning' },
        { key: 'export', title: 'Export', value: 'Ready', tone: 'success' },
      ],
    },
    sources: [],
    confirmations: [],
    artifactSummary: {
      total: 7,
      planned: 7,
      pending: 0,
      ready: 5,
      locked: 0,
      superseded: 0,
      failed: 0,
      byKind: {
        preview_bundle: 1,
        preview_page_svg: 2,
        export_pptx: 1,
        runtime_log: 1,
      },
    },
    lastRunId: 'run-export-001',
    artifacts: [
      ...strategistArtifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        kind: artifact.kind,
        status: artifact.status,
        label: artifact.label,
      })),
      {
        artifactId: 'pptmaster-app-shell-artifact-project-preview-bundle',
        kind: 'preview_bundle',
        status: 'ready',
        label: 'Preview bundle manifest',
      },
      {
        artifactId: 'pptmaster-app-shell-artifact-project-page-1',
        kind: 'preview_page_svg',
        status: 'ready',
        label: 'Preview page page-1',
      },
      {
        artifactId: 'pptmaster-app-shell-artifact-project-page-2',
        kind: 'preview_page_svg',
        status: 'ready',
        label: 'Preview page page-2',
      },
      {
        artifactId: 'pptmaster-app-shell-artifact-project-export-pptx',
        kind: 'export_pptx',
        status: 'ready',
        label: 'PPTX export',
      },
      {
        artifactId: 'pptmaster-app-shell-artifact-project-export-md',
        kind: 'runtime_log',
        status: 'ready',
        label: 'Runtime log',
      },
    ],
    lastUpdatedAt: '2026-07-09T12:30:00.000Z',
  };
}

function makeRecoveryShellView(): ProjectViewModel {
  return {
    projectId: 'pptmaster-app-shell-recovery-project',
    name: 'PPTMASTER App Shell Recovery Project',
    status: 'revision_requested',
    title: 'Revision requested',
    description: 'Revision feedback is waiting before generation can resume.',
    workspacePath: 'projects/pptmaster-app-shell-recovery-project',
    currentPhase: {
      status: 'revision_requested',
      title: 'Revision requested',
      description: 'Revision feedback is waiting before generation can resume.',
    },
    timeline: [],
    nextActions: [],
    latestPreviewUrl: '/projects/pptmaster-app-shell-recovery-project/preview/index.json',
    preview: {
      latestPreviewUrl: '/projects/pptmaster-app-shell-recovery-project/preview/index.json',
      manifestStorageKey: 'projects/pptmaster-app-shell-recovery-project/preview/index.json',
      pageCount: 1,
      pageArtifactIds: ['pptmaster-app-shell-recovery-project-page-1'],
      items: [
        {
          artifactId: 'pptmaster-app-shell-recovery-project-preview-bundle',
          kind: 'preview_bundle',
          title: 'Preview bundle manifest',
          storageKey: 'projects/pptmaster-app-shell-recovery-project/preview/index.json',
          filename: 'index.json',
          mimeType: 'application/json',
          role: 'bundle',
        },
        {
          artifactId: 'pptmaster-app-shell-recovery-project-page-1',
          kind: 'preview_page_svg',
          title: 'Preview page page-1',
          storageKey: 'projects/pptmaster-app-shell-recovery-project/svg_output/01_cover.svg',
          filename: '01_cover.svg',
          mimeType: 'image/svg+xml',
          role: 'page',
          pageKey: 'page-1',
        },
      ],
    },
    latestCheckpoint: {
      checkpointId: 'checkpoint-revision-requested-001',
      storageKey: 'projects/pptmaster-app-shell-recovery-project/checkpoints/checkpoint-revision-requested-001.json',
      stage: 'revision_requested',
      stageTitle: 'Revision Requested',
      status: 'completed',
      statusTitle: 'Completed',
      title: 'Revision Requested',
      artifactIds: ['pptmaster-app-shell-recovery-project-revision-log'],
      createdAt: '2026-07-09T12:40:00.000Z',
      note: 'Tighten the page 1 headline before export.',
    },
    workbench: {
      sections: [
        {
          key: 'confirmations',
          title: 'Confirmation status',
          status: 'complete',
          summary: 'All confirmations locked.',
        },
        {
          key: 'preview',
          title: 'Preview',
          status: 'complete',
          summary: 'Preview bundle available for revision review.',
        },
        {
          key: 'export',
          title: 'Delivery Export',
          status: 'upcoming',
          summary: 'Export stays blocked until the revision cycle is complete.',
        },
      ],
      confirmationState: {
        recommendationCount: 8,
        answeredCount: 8,
        locked: true,
        displayStatus: 'completed',
      },
      summaryCards: [
        { key: 'preview', title: 'Preview', value: '1 page(s)', tone: 'success' },
        { key: 'export', title: 'Export', value: 'Blocked by revision', tone: 'warning' },
      ],
    },
    sources: [],
    confirmations: [],
    artifactSummary: {
      total: 2,
      planned: 2,
      pending: 0,
      ready: 2,
      locked: 0,
      superseded: 0,
      failed: 0,
      byKind: {
        preview_bundle: 1,
        runtime_log: 1,
      },
    },
    artifacts: [
      {
        artifactId: 'pptmaster-app-shell-recovery-project-preview-bundle',
        kind: 'preview_bundle',
        status: 'ready',
        label: 'Preview bundle manifest',
      },
      {
        artifactId: 'pptmaster-app-shell-recovery-project-revision-log',
        kind: 'runtime_log',
        status: 'ready',
        label: 'Revision request note',
      },
    ],
    lastError: 'Preview sync timed out while waiting for the updated bundle upload.',
    lastUpdatedAt: '2026-07-09T12:40:00.000Z',
  };
}

function makeFailedRecoverableShellView(): ProjectViewModel {
  return {
    projectId: 'pptmaster-app-shell-failed-project',
    name: 'PPTMASTER App Shell Failed Project',
    status: 'failed_recoverable',
    title: 'Recoverable failure',
    description: 'The workflow paused after a recoverable failure.',
    workspacePath: 'projects/pptmaster-app-shell-failed-project',
    currentPhase: {
      status: 'failed_recoverable',
      title: 'Recoverable failure',
      description: 'The workflow paused after a recoverable failure.',
    },
    timeline: [],
    nextActions: [],
    latestCheckpoint: {
      checkpointId: 'checkpoint-generation-failed-001',
      storageKey: 'projects/pptmaster-app-shell-failed-project/checkpoints/checkpoint-generation-failed-001.json',
      stage: 'generation_started',
      stageTitle: 'Generation Started',
      status: 'failed',
      statusTitle: 'Failed',
      title: 'Generation Started',
      artifactIds: [],
      createdAt: '2026-07-09T12:42:00.000Z',
      note: 'Executor runtime bridge is not available in the product shell.',
    },
    workbench: {
      sections: [
        {
          key: 'preview',
          title: 'Preview',
          status: 'upcoming',
          summary: 'Preview cannot sync until generation succeeds.',
        },
        {
          key: 'recovery',
          title: 'Recoverable failure',
          status: 'warning',
          summary: 'Recoverable failure: Executor runtime bridge is not available in the product shell.',
          description: 'The workflow paused after a recoverable failure. Resume remains blocked until the recovery bridge exists.',
          badges: [{ tone: 'warning', text: 'Recoverable failure' }],
        },
      ],
      confirmationState: {
        recommendationCount: 8,
        answeredCount: 8,
        locked: true,
        displayStatus: 'completed',
      },
      summaryCards: [
        { key: 'preview', title: 'Preview', value: '0 page(s)', tone: 'neutral' },
        { key: 'export', title: 'Export', value: 'Pending', tone: 'neutral' },
      ],
    },
    sources: [],
    confirmations: [],
    artifacts: [],
    lastError: 'Executor runtime bridge is not available in the product shell.',
    lastUpdatedAt: '2026-07-09T12:42:00.000Z',
  };
}

function makeTerminalFailureShellView(): ProjectViewModel {
  return {
    projectId: 'pptmaster-app-shell-terminal-project',
    name: 'PPTMASTER App Shell Terminal Project',
    status: 'failed_terminal',
    title: 'Terminal failure',
    description: 'The workflow stopped after a terminal failure.',
    workspacePath: 'projects/pptmaster-app-shell-terminal-project',
    currentPhase: {
      status: 'failed_terminal',
      title: 'Terminal failure',
      description: 'The workflow stopped after a terminal failure.',
    },
    timeline: [],
    nextActions: [],
    latestCheckpoint: {
      checkpointId: 'checkpoint-generation-terminal-001',
      storageKey: 'projects/pptmaster-app-shell-terminal-project/checkpoints/checkpoint-generation-terminal-001.json',
      stage: 'generation_started',
      stageTitle: 'Generation Started',
      status: 'failed',
      statusTitle: 'Failed',
      title: 'Generation Started',
      artifactIds: [],
      createdAt: '2026-07-09T12:45:00.000Z',
      note: 'Executor process exited before producing preview assets.',
    },
    workbench: {
      sections: [
        {
          key: 'preview',
          title: 'Preview',
          status: 'upcoming',
          summary: 'Preview never became available because generation terminated early.',
        },
        {
          key: 'recovery',
          title: 'Terminal failure',
          status: 'warning',
          summary: 'Terminal failure: Executor process exited before producing preview assets.',
          description: 'The workflow stopped after a terminal failure and cannot resume automatically.',
          badges: [{ tone: 'warning', text: 'Terminal failure' }],
        },
      ],
      confirmationState: {
        recommendationCount: 8,
        answeredCount: 8,
        locked: true,
        displayStatus: 'completed',
      },
      summaryCards: [
        { key: 'preview', title: 'Preview', value: '0 page(s)', tone: 'neutral' },
        { key: 'export', title: 'Export', value: 'Blocked by terminal failure', tone: 'warning' },
      ],
    },
    sources: [],
    confirmations: [],
    artifacts: [],
    lastError: 'Executor process exited before producing preview assets.',
    lastUpdatedAt: '2026-07-09T12:45:00.000Z',
  };
}

function main() {
  const preparedView = createPreparedShell();
  const preparedHtml = renderProjectWorkbenchShell(preparedView);

  assert.match(preparedHtml, /<!doctype html>/i);
  assert.match(preparedHtml, /PPTMASTER App Shell Project/);
  assert.match(preparedHtml, /Current phase: Confirmation status/);
  assert.doesNotMatch(preparedHtml, /<dt>Workspace<\/dt>/, 'the shell must not expose its server workspace metadata');
  assert.match(preparedHtml, /Current phase status/);
  assert.match(preparedHtml, /confirmation_pending/);
  assert.match(preparedHtml, /Last updated/);
  assert.match(preparedHtml, /2026-07-09T12:10:00.000Z/);
  assert.match(preparedHtml, /class="project-header-metadata"/);
  assert.match(preparedHtml, /summary-card tone-warning/);
  assert.match(preparedHtml, /data-key="sources"/);
  assert.match(preparedHtml, /<h3>Sources<\/h3>/);
  assert.match(preparedHtml, /<p class="summary-value">1 intake<\/p>/);
  assert.match(preparedHtml, /data-key="confirmations"/);
  assert.match(preparedHtml, /<p class="summary-value">0\/8 answered<\/p>/);
  assert.match(preparedHtml, /data-key="strategist"/);
  assert.match(preparedHtml, /Awaiting artifacts/);
  assert.match(preparedHtml, /data-key="preview"/);
  assert.match(preparedHtml, /<p class="summary-value">0 page\(s\)<\/p>/);
  assert.match(preparedHtml, /data-key="export"/);
  assert.match(preparedHtml, /<p class="summary-value">Pending<\/p>/);
  assert.match(preparedHtml, /data-key="artifacts"/);
  assert.match(preparedHtml, /<h3>Artifacts<\/h3>/);
  assert.match(preparedHtml, /<p class="summary-value">4\/4 ready<\/p>/);
  assert.match(preparedHtml, /data-panel="directory"/);
  assert.match(preparedHtml, /Workbench directory/);
  assert.match(preparedHtml, /<a class="skip-link" href="#panel-confirmations">Skip to primary workbench panel<\/a>/);
  assert.match(preparedHtml, /<main[^>]+aria-labelledby="project-title"/);
  assert.match(preparedHtml, /<h1 id="project-title">PPTMASTER App Shell Project<\/h1>/);
  assert.match(preparedHtml, /data-target="confirmations" data-primary-panel="true"/);
  assert.match(preparedHtml, /href="#panel-confirmations" aria-current="page"/);
  assert.match(preparedHtml, /data-target="timeline" data-primary-panel="false"/);
  assert.match(preparedHtml, /href="#panel-timeline"/);
  assert.match(preparedHtml, /href="#panel-sources"/);
  assert.match(preparedHtml, /href="#panel-next-actions"/);
  assert.match(preparedHtml, /href="#panel-checkpoint"/);
  assert.match(preparedHtml, /href="#panel-artifact-summary"/);
  assert.match(preparedHtml, /href="#panel-workbench-sections"/);
  assert.match(preparedHtml, /href="#panel-confirmations"/);
  assert.match(preparedHtml, /href="#panel-artifacts"/);
  assert.match(preparedHtml, /data-panel="confirmations"/);
  assert.match(preparedHtml, /id="panel-confirmations"[^>]+tabindex="-1"[^>]+aria-labelledby="panel-confirmations-title"/);
  assert.match(preparedHtml, /<h2 id="panel-confirmations-title">Confirmation submission<\/h2>/);
  assert.match(preparedHtml, /Confirmation submission/);
  assert.match(preparedHtml, /0\/8 answered/);
  assert.match(preparedHtml, /No answers captured yet\. Fill the confirmation prompts below to lock the deck brief\./);
  assert.match(preparedHtml, /data-answered-badge/);
  assert.match(preparedHtml, /0 answered/);
  assert.match(preparedHtml, /data-pending-badge/);
  assert.match(preparedHtml, /8 pending/);
  assert.match(preparedHtml, /data-readiness-state="pending"/);
  assert.match(preparedHtml, /confirmation answers are still required before submission\./);
  assert.match(preparedHtml, /8 confirmation answers ready for input\./);
  assert.match(preparedHtml, /<dl class="artifact-metadata">[\s\S]*<dt>Completion status<\/dt>[\s\S]*<dd>pending<\/dd>[\s\S]*<dt>Question count<\/dt>[\s\S]*<dd>8<\/dd>[\s\S]*<\/dl>/);
  assert.match(preparedHtml, /<form class="confirmation-form" method="post" action="\/projects\/pptmaster-app-shell-project" data-submit-action="submit_confirmations" data-project-id="pptmaster-app-shell-project">/);
  assert.match(preparedHtml, /fetch\(form\.action,\{method:'POST',headers:\{'content-type':'application\/json'\}/, 'confirmation shell must serialize answers to the JSON POST route');
  assert.match(preparedHtml, /<textarea id="confirmation-input-audience"[\s\S]*name="answers\.audience"[\s\S]*placeholder="Who is the primary audience for this deck\?"[\s\S]*data-confirmation-key="audience"[\s\S]*data-question-index="1"[\s\S]*aria-label="Primary audience"><\/textarea>/);
  assert.match(preparedHtml, /<button type="submit" class="confirmation-submit-button"[^>]*data-submit-action="submit_confirmations"[^>]*data-project-id="pptmaster-app-shell-project"[^>]*disabled[^>]*>Submit confirmation answers<\/button>/, 'the visible confirmation CTA should preserve the projected action and project context for a browser-side bridge while staying disabled until all answers are complete');
  assert.match(preparedHtml, /Placeholder: Who is the primary audience for this deck\?/);
  assert.match(preparedHtml, /data-key="audience" data-state="pending"/);
  assert.match(preparedHtml, /data-key="goal" data-state="pending"/);
  assert.match(preparedHtml, /data-panel="workbench-sections"/);
  assert.match(preparedHtml, /Workflow status/);
  assert.match(preparedHtml, /1 current · 1 complete · 1 upcoming/);
  assert.match(preparedHtml, /data-panel="timeline"/);

  assert.match(preparedHtml, /Source intake/);
  assert.match(preparedHtml, /data-panel="sources"/);
  assert.match(preparedHtml, /Seed memo/);
  assert.match(preparedHtml, /1 source\(s\)/);
  assert.match(preparedHtml, /data-panel="checkpoint"/);
  assert.match(preparedHtml, /checkpoint-confirmations-prepared-001/);
  assert.doesNotMatch(preparedHtml, /<li>checkpoint-confirmations-prepared-001<\/li>/, 'checkpoint artifacts list should stay scoped to artifact ids and not repeat the checkpoint id itself');
  assert.match(preparedHtml, /Current phase status/);
  assert.match(preparedHtml, /confirmation_pending/);
  assert.doesNotMatch(preparedHtml, /<dt>Workspace<\/dt>/, 'the next action projection must not expose server workspace metadata');
  assert.match(preparedHtml, /projects\/pptmaster-app-shell-project/);

  assert.match(preparedHtml, /2026-07-09T12:10:00.000Z/);
  assert.match(preparedHtml, /Prepared confirmation recommendations from imported source intake\./);
  assert.match(preparedHtml, /<li>pptmaster-app-shell-project-source-1<\/li>/);
  assert.match(preparedHtml, /data-panel="artifact-summary"/);
  assert.match(preparedHtml, /id="panel-artifact-summary"[^>]+tabindex="-1"[^>]+aria-labelledby="panel-artifact-summary-title"/);
  assert.match(preparedHtml, /<h2 id="panel-artifact-summary-title">Artifact inventory<\/h2>/);
  assert.match(preparedHtml, /Artifact inventory/);
  assert.match(preparedHtml, /4\/4 ready/);
  assert.match(preparedHtml, /<code>confirmation_recommendations<\/code><span class="artifact-kind-count">1<\/span>/);
  assert.match(preparedHtml, /Source intake/);
  assert.match(preparedHtml, /data-panel="sources"/);
  assert.match(preparedHtml, /Seed memo/);
  assert.match(preparedHtml, /1 source\(s\)/);
  assert.match(preparedHtml, /data-panel="checkpoint"/);
  assert.match(preparedHtml, /checkpoint-confirmations-prepared-001/);
  assert.match(preparedHtml, /Prepared confirmation recommendations from imported source intake\./);

  assert.match(preparedHtml, /data-panel="artifacts"/);
  assert.match(preparedHtml, /4 tracked/);
  assert.match(preparedHtml, /Seed memo/);

  const importedProject: ProjectRecord = {
    projectId: 'pptmaster-app-shell-preview-project',
    name: 'PPTMASTER App Shell Preview Project',
    status: 'draft',
    workspace: {
      projectId: 'pptmaster-app-shell-preview-project',
      workspacePath: 'projects/pptmaster-app-shell-preview-project',
    },
    createdAt: '2026-07-09T12:20:00.000Z',
    updatedAt: '2026-07-09T12:20:00.000Z',
  };

  const importedPreview = applyImportSources(
    importedProject,
    {
      type: 'import_sources',
      payload: {
        projectId: importedProject.projectId,
        sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
      },
    },
    '2026-07-09T12:21:00.000Z',
  );

  const preparedPreview = applyPrepareConfirmations(
    importedPreview.project,
    importedPreview.artifacts,
    {
      type: 'prepare_confirmations',
      payload: { projectId: importedProject.projectId },
    },
    '2026-07-09T12:22:00.000Z',
  );

  const submittedAction: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: importedProject.projectId,
      answers: {
        audience: 'Founders preparing an investor pitch.',
        goal: 'Secure interest for a follow-up partner meeting.',
        tone: 'Crisp and confident.',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark editorial',
        delivery: 'live pitch',
      },
    },
  };
  const submittedPreview = applySubmitConfirmations(preparedPreview.project, submittedAction, '2026-07-09T12:24:00.000Z');

  const previewView = toProjectViewModel(
    submittedPreview.project,
    [...importedPreview.artifacts, preparedPreview.artifact, ...submittedPreview.artifacts],
    preparedPreview.recommendations,
    submittedPreview.checkpoint,
  );
  const previewHtml = renderProjectWorkbenchShell(previewView);

  assert.match(previewHtml, /data-key="strategist"/);
  assert.match(previewHtml, /data-key="sources"/);
  assert.match(previewHtml, /<p class="summary-value">1 intake<\/p>/);
  assert.match(previewHtml, /Pending runtime verification|runtime verification/);
  assert.match(previewHtml, /data-key="confirmations"/);
  assert.match(previewHtml, /Current phase:/);
  assert.match(previewHtml, /Current phase status/);
  assert.match(previewHtml, /spec_ready/);
  assert.doesNotMatch(previewHtml, /<dt>Workspace<\/dt>/, 'preview action UI must not expose server workspace metadata');
  assert.match(previewHtml, /projects\/pptmaster-app-shell-preview-project/);
  assert.match(previewHtml, /Founders preparing an investor pitch\./);
  assert.match(previewHtml, /Secure interest for a follow-up partner meeting\./);
  assert.match(previewHtml, /data-key="audience">\s*<strong>Primary audience<\/strong>\s*<span class="question-state">answered<\/span>/);
  assert.match(previewHtml, /data-key="goal">\s*<strong>Presentation goal<\/strong>\s*<span class="question-state">answered<\/span>/);
  assert.match(previewHtml, /Last updated/);
  assert.match(previewHtml, /2026-07-09T12:24:00.000Z/);
  assert.match(previewHtml, /1 normalized/);
  assert.match(previewHtml, /current-phase-description/);
  assert.match(previewHtml, /Package preview output into export artifacts\./, 'the rendered header should truthfully describe the projected current phase');
  assert.match(previewHtml, /2 complete · 1 warning · 1 upcoming/, 'workflow summary should reflect the projected section states without inventing a current section');
  assert.match(previewHtml, /data-target="confirmations" data-primary-panel="true"/, 'directory should mark the confirmation panel as primary when it remains available without a current workflow section');
  assert.match(previewHtml, /<a class="skip-link" href="#panel-confirmations">Skip to primary workbench panel<\/a>/, 'skip link should target the resolved primary panel');
  assert.match(previewHtml, /href="#panel-confirmations" aria-current="page"/, 'directory should expose the resolved primary panel as current');
  assert.match(previewHtml, /href="#panel-strategist"/);
  assert.doesNotMatch(previewHtml, /href="#panel-preview"/, 'directory should not link a preview panel before preview artifacts are projected');
  assert.doesNotMatch(previewHtml, /href="#panel-export"/, 'directory should not link an export panel before export artifacts are projected');
  assert.match(previewHtml, /href="#panel-confirmations"/);
  assert.match(previewHtml, /data-panel="confirmations"/);
  assert.match(previewHtml, /8\/8 answered/);
  assert.match(previewHtml, /8\/8 confirmation answers locked and ready for strategist handoff\./);
  assert.match(previewHtml, /Answer: Founders preparing an investor pitch\./);
  assert.match(previewHtml, /Answer: live pitch/);
  assert.match(previewHtml, /href="#panel-artifacts"/);
  assert.doesNotMatch(previewHtml, /<h2>Preview assets<\/h2>/, 'preview panel should remain absent before preview assets are projected');
  assert.doesNotMatch(previewHtml, /<h2>Export assets<\/h2>/, 'export panel should remain absent before export artifacts are projected');
  assert.match(previewHtml, /data-key="artifacts"/);
  assert.match(previewHtml, /<p class="summary-value">6\/8 ready<\/p>/, 'artifact summary should include the projected strategist, source, and confirmation artifacts');
  assert.match(previewHtml, /tone-success/);
  assert.match(previewHtml, /Completion status/);
  assert.match(previewHtml, /complete/);
  assert.match(previewHtml, /Question count/);
  assert.match(previewHtml, /8/);
  assert.match(previewHtml, /8 answers captured; 0 still need review\./);
  assert.match(previewHtml, /Captured answers/);
  assert.match(previewHtml, /Founders preparing an investor pitch\./);
  assert.match(previewHtml, /data-answered-badge/);
  assert.match(previewHtml, /8 answered/);
  assert.match(previewHtml, /data-pending-badge/);
  assert.match(previewHtml, /0 pending/);
  assert.match(previewHtml, /data-readiness-state="ready"/);
  assert.match(previewHtml, /All confirmation answers are complete\. Submission is ready\./);
  assert.match(previewHtml, /<textarea id="confirmation-input-audience" name="answers\.audience" rows="3" placeholder="Who is the primary audience for this deck\?" data-confirmation-key="audience" data-question-index="1" aria-label="Primary audience">Founders preparing an investor pitch\.<\/textarea>/);
  assert.match(previewHtml, /<button type="submit" class="confirmation-submit-button" data-submit-action="submit_confirmations" data-project-id="pptmaster-app-shell-preview-project">Update locked confirmations<\/button>/, 'locked confirmation CTA should retain its browser bridge action context');

  const artifactRichHtml = renderProjectWorkbenchShell(makeArtifactRichShellView());

  assert.doesNotMatch(artifactRichHtml, /data-key="sources"/, 'artifact-only shell should not invent a source summary card');
  assert.doesNotMatch(artifactRichHtml, /<p class="summary-value">1 intake<\/p>/, 'artifact-only shell should not report source intake');
  assert.doesNotMatch(artifactRichHtml, /data-key="artifacts"/, 'artifact-rich render does not synthesize a summary card when the view model omits one');
  assert.doesNotMatch(artifactRichHtml, /<p class="summary-value">8\/8 ready<\/p>/, 'artifact-rich render should not invent a summary-card value absent from its view model');
  assert.match(artifactRichHtml, /data-panel="next-actions"/);
  assert.match(artifactRichHtml, /Continue from Export ready with the next productized workflow action\(s\)\./);
  assert.match(artifactRichHtml, /badge badge-active">1 workflow action<\/span>/);
  assert.match(artifactRichHtml, /badge badge-neutral">Primary: Export Pptx<\/span>/);
  assert.match(artifactRichHtml, /class="next-action-card is-primary" data-action-index="1" data-primary-action="true" data-action-code="export_pptx"/);
  assert.match(artifactRichHtml, /<p class="action-kicker">Primary action<\/p>/);
  assert.match(artifactRichHtml, /<h3>Export Pptx<\/h3>/);
  assert.match(artifactRichHtml, /Export bridge/);
  assert.match(artifactRichHtml, /Package the current preview output into the PPTX delivery bundle and companion artifacts\./);
  assert.match(artifactRichHtml, /Action code/);
  assert.match(artifactRichHtml, /Current phase/);
  assert.match(artifactRichHtml, /Primary/);
  assert.match(artifactRichHtml, /data-target="export" data-primary-panel="true"/, 'primary directory entry should follow the projected export workflow state');
  assert.match(artifactRichHtml, /<a class="skip-link" href="#panel-export">Skip to primary workbench panel<\/a>/, 'skip link should target the same projected export panel');
  assert.match(artifactRichHtml, /href="#panel-export"/);
  assert.match(artifactRichHtml, /href="#panel-export" aria-current="page"/, 'projected export directory entry should be marked for assistive navigation');
  assert.match(artifactRichHtml, /href="#panel-export"/);
  assert.match(artifactRichHtml, /href="#panel-delivery"/);
  assert.match(artifactRichHtml, /href="#panel-strategist">Strategist handoff<\/a>/, 'directory should expose the dedicated strategist handoff slice');
  assert.match(artifactRichHtml, /data-panel="artifact-summary"/);
  assert.match(artifactRichHtml, /7\/7 ready|5\/7 ready/);
  assert.match(artifactRichHtml, /preview_bundle/);
  assert.match(artifactRichHtml, /runtime_log/);
  assert.match(artifactRichHtml, /data-panel="strategist"/);
  assert.match(artifactRichHtml, /Strategist handoff/, 'strategist handoff panel should retain the productized shell label');
  assert.match(artifactRichHtml, /Pending runtime verification/);
  assert.match(artifactRichHtml, /Pending runtime verification/, 'strategist panel should disclose runtime verification state');
  assert.match(artifactRichHtml, /Generation handoff locked: wait for runtime bridge verification before starting page generation\./, 'strategist panel should disclose the locked generation gate copy while verification is pending');
  assert.match(artifactRichHtml, /Gate label<\/dt>\s*<dd>Verification pending<\/dd>/, 'strategist metadata should expose the projected gate label');
  assert.match(artifactRichHtml, /href="#panel-strategist">Strategist handoff<\/a>\s*<span class="directory-status">Verification pending<\/span>/, 'directory should summarize strategist verification as its own slice state');
  assert.match(artifactRichHtml, /<section id="panel-strategist" class="strategist-panel" data-panel="strategist" data-status="warning"/, 'strategist panel should surface warning status while runtime verification is pending');
  assert.match(artifactRichHtml, /data-verification-state="pending_runtime_verification"/, 'strategist artifacts should expose pending runtime verification state for each projected handoff artifact');
  assert.match(artifactRichHtml, /data-panel="workbench-sections"/);
  assert.match(artifactRichHtml, /3 complete/, 'workflow status should summarize the artifact-rich view model section states');
  assert.match(artifactRichHtml, /design_spec/);
  assert.match(artifactRichHtml, /spec_lock/);
  assert.match(artifactRichHtml, /data-panel="artifacts"/);
  assert.match(artifactRichHtml, /7 tracked/);
  assert.match(artifactRichHtml, /pptmaster-app-shell-artifact-project-export-pptx/);
  assert.match(artifactRichHtml, /Preview assets/);
  assert.doesNotMatch(artifactRichHtml, /<h2>Preview assets<\/h2>/, 'artifact-rich view should not invent a preview panel without a preview view model');
  assert.match(artifactRichHtml, /projects\/pptmaster-app-shell-artifact-project\/preview\/index\.json/);
  assert.match(artifactRichHtml, /2 page asset\(s\)/);
  assert.match(artifactRichHtml, /page-2/);
  assert.match(artifactRichHtml, /index\.json/);
  assert.match(artifactRichHtml, /application\/json/);
  assert.match(artifactRichHtml, /Preview bundle manifest/);
  assert.match(artifactRichHtml, /01_cover\.svg/);
  assert.match(artifactRichHtml, /image\/svg\+xml/);
  assert.match(artifactRichHtml, /data-preview-page-focus="true"/, 'preview panel should surface the focused preview-page slice when page artifacts exist');
  assert.match(artifactRichHtml, /Focused preview page/, 'preview panel should label the focused preview-page summary');
  assert.match(artifactRichHtml, /Select a projected page artifact to inspect its current identifiers\./, 'preview panel should explain the page focus slice honestly');
  assert.match(artifactRichHtml, /aria-live="polite"/, 'preview page summary should announce focus changes politely');
  assert.match(artifactRichHtml, /data-preview-page-button="true"/, 'preview page controls should expose stable browser hooks');
  assert.match(artifactRichHtml, /aria-pressed="true"[\s\S]*data-selected="true"/, 'first preview page should be selected in the server-rendered html');
  assert.match(artifactRichHtml, /data-preview-page-title="Preview page page-1"/, 'preview page controls should reuse the projected page title');
  assert.match(artifactRichHtml, /data-preview-page-key="page-1"/, 'preview page controls should reuse the projected page key');
  assert.match(artifactRichHtml, /data-preview-page-filename="01_cover\.svg"/, 'preview page controls should reuse the projected filename');
  assert.match(artifactRichHtml, /data-preview-page-storage-key="projects\/pptmaster-app-shell-artifact-project\/svg_output\/01_cover\.svg"/, 'preview page controls should reuse the projected storage key');
  assert.match(artifactRichHtml, /<dt>Page key<\/dt><dd>page-1<\/dd>/, 'preview page summary should disclose the focused page key');
  assert.match(artifactRichHtml, /<dt>Filename<\/dt><dd>01_cover\.svg<\/dd>/, 'preview page summary should disclose the focused page filename');
  assert.match(artifactRichHtml, /<dt>Storage key<\/dt><dd>projects\/pptmaster-app-shell-artifact-project\/svg_output\/01_cover\.svg<\/dd>/, 'preview page summary should disclose the focused page storage key');
  assert.match(artifactRichHtml, /Selection identifies the projected page artifact\. Use the live preview link to open the current rendered view\./, 'preview page summary should avoid inventing a per-page url when only the live preview exists');
  assert.match(artifactRichHtml, /data-preview-action="open">Open live preview<\/a>/, 'preview panel should preserve the existing live-preview link');
  assert.match(artifactRichHtml, /Export label/);
  assert.match(artifactRichHtml, /PPTX export/);
  assert.match(artifactRichHtml, /Last run ID/);
  assert.match(artifactRichHtml, /run-export-001/);
  assert.doesNotMatch(artifactRichHtml, /<h2>Export assets<\/h2>/, 'artifact-rich view should not invent an export panel without an export view model');
  assert.match(artifactRichHtml, /Filename/);
  assert.match(artifactRichHtml, /demo\.pptx/);
  assert.match(artifactRichHtml, /Artifact count/);
  assert.match(artifactRichHtml, />3<|3<\/dd>/);
  assert.match(artifactRichHtml, /Companion count/);
  assert.match(artifactRichHtml, /projects\/pptmaster-app-shell-artifact-project\/exports\/demo\.md/);
  assert.match(artifactRichHtml, /<section id="panel-delivery" class="artifact-panel delivery-panel" data-panel="delivery"/, 'artifact-rich view should surface the dedicated delivery panel');
  assert.match(artifactRichHtml, /<dt>Primary artifact<\/dt><dd>pptmaster-app-shell-artifact-project-export-pptx<\/dd>/, 'delivery panel should disclose the projected primary artifact id');
  assert.match(artifactRichHtml, /<dt>Primary label<\/dt><dd>PPTX export<\/dd>/, 'delivery panel should disclose the projected primary label');
  assert.match(artifactRichHtml, /<dt>Primary storage key<\/dt><dd>projects\/pptmaster-app-shell-artifact-project\/exports\/demo\.pptx<\/dd>/, 'delivery panel should disclose the projected primary storage key');
  assert.match(artifactRichHtml, /<dt>Run ID<\/dt><dd>run-export-001<\/dd>/, 'delivery panel should disclose the projected export run id');
  assert.match(artifactRichHtml, /<dt>Asset directory<\/dt><dd>projects\/pptmaster-app-shell-artifact-project\/exports\/demo_files<\/dd>/, 'delivery panel should disclose the projected asset directory');
  assert.match(artifactRichHtml, /<dt>Companion artifact count<\/dt>\s*<dd>1<\/dd>/, 'delivery panel should disclose the rendered companion artifact count from projected delivery items');
  assert.match(artifactRichHtml, /data-role="primary" data-kind="export_pptx"/, 'delivery items should mark the projected primary export artifact');
  assert.match(artifactRichHtml, /data-role="companion" data-kind="runtime_log"/, 'delivery items should mark runtime-log companions');
  assert.match(artifactRichHtml, /demo\.pptx<\/span>/, 'delivery panel should show filename hints for the primary artifact');
  assert.match(artifactRichHtml, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation<\/span>/, 'delivery panel should show mime hints for the primary artifact');
  assert.match(artifactRichHtml, /demo\.md<\/span>/, 'delivery panel should show filename hints for companion artifacts');
  assert.match(artifactRichHtml, /projects\/pptmaster-app-shell-artifact-project\/exports\/demo_files\/image_manifest\.json/, 'delivery metadata should still surface the projected image-manifest companion storage key');

  const verifiedStrategistHtml = renderProjectWorkbenchShell({
    ...makeArtifactRichShellView(),
    workbench: {
      ...makeArtifactRichShellView().workbench,
      strategistHandoff: {
        gateStatus: 'verified',
        summary: 'Design spec and spec lock are verified for generation.',
        detail: 'Generation may proceed because both strategist handoff artifacts are present and verified by the runtime bridge.',
        panelStatus: 'complete',
        verificationBadgeTone: 'success',
        verificationBadgeText: 'Runtime bridge verified',
        gateLabel: 'Verified handoff',
        verifiedArtifactCount: 2,
        pendingArtifactCount: 0,
        generationGateCopy: 'Generation handoff unlocked: runtime verification is complete.',
        artifacts: [
          {
            artifactId: 'pptmaster-app-shell-artifact-project-design-spec',
            kind: 'design_spec',
            label: 'Strategist design spec (verified)',
            status: 'ready',
            verificationState: 'verified',
            storageKey: 'projects/pptmaster-app-shell-artifact-project/design_spec.md',
          },
          {
            artifactId: 'pptmaster-app-shell-artifact-project-spec-lock',
            kind: 'spec_lock',
            label: 'Strategist spec lock (verified)',
            status: 'ready',
            verificationState: 'verified',
            storageKey: 'projects/pptmaster-app-shell-artifact-project/spec_lock.md',
          },
        ],
      },
      sections: makeArtifactRichShellView().workbench.sections.map((section) =>
        section.key === 'strategist'
          ? {
              ...section,
              status: 'complete',
              summary: 'Design spec and spec lock are verified for generation.',
              description: 'Strategist artifacts gate generation entry for the product shell.',
              badges: [{ tone: 'success', text: 'Strategist verified' }],
            }
          : section,
      ),
      summaryCards: makeArtifactRichShellView().workbench.summaryCards.map((card) =>
        card.key === 'strategist'
          ? { ...card, value: 'Verified', tone: 'success' }
          : card,
      ),
    },
  });

  assert.match(verifiedStrategistHtml, /Runtime bridge verified/, 'verified strategist handoff should disclose runtime bridge completion');
  assert.match(verifiedStrategistHtml, /Generation handoff unlocked: runtime verification is complete\./, 'verified strategist handoff should unlock the generation gate copy');
  assert.match(verifiedStrategistHtml, /Gate label<\/dt>\s*<dd>Verified handoff<\/dd>/, 'verified strategist metadata should expose the unlocked gate label');
  assert.match(verifiedStrategistHtml, /data-verification-state="verified"/, 'verified strategist artifacts should expose verified runtime state');
  assert.match(verifiedStrategistHtml, /Runtime bridge verified/, 'verified strategist section badge should render success state');
  assert.match(artifactRichHtml, /projects\/pptmaster-app-shell-artifact-project\/exports\/demo_files\/image_manifest\.json/);
  assert.match(artifactRichHtml, /Asset directory/);
  assert.match(artifactRichHtml, /exports\/demo_files/);
  assert.match(artifactRichHtml, /Primary label/);
  assert.match(artifactRichHtml, /Companion artifact count/);
  assert.match(artifactRichHtml, /data-panel="delivery"/);
  assert.match(artifactRichHtml, /Delivery package/);
  assert.match(artifactRichHtml, /Primary artifact/);
  assert.match(artifactRichHtml, /<section[^>]+id="panel-delivery"[^>]+data-panel="delivery"/);
  assert.match(artifactRichHtml, /<section[^>]+id="panel-delivery"[^>]+tabindex="-1"[^>]+aria-labelledby="panel-delivery-title"/, 'delivery panel should follow the same focusable, labelled panel contract as directory-linked workbench slices');
  assert.match(artifactRichHtml, /<h2 id="panel-delivery-title">Delivery package<\/h2>/, 'delivery heading should be the explicit accessible name for its panel');
  assert.match(artifactRichHtml, /<dt>Companion artifact count<\/dt>[\s\S]*<dd>1<\/dd>/, 'delivery panel should disclose the rendered companion artifact count from projected delivery items');
  assert.match(artifactRichHtml, /data-role="primary" data-kind="export_pptx"/);
  assert.match(artifactRichHtml, /data-role="companion" data-kind="runtime_log"/);
  assert.match(artifactRichHtml, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/);
  assert.match(artifactRichHtml, /text\/markdown/);

  const bundleOnlyPreviewHtml = renderProjectWorkbenchShell({
    ...makeArtifactRichShellView(),
    preview: {
      latestPreviewUrl: '/projects/pptmaster-app-shell-artifact-project/preview/index.json',
      manifestStorageKey: 'projects/pptmaster-app-shell-artifact-project/preview/index.json',
      pageCount: 0,
      pageArtifactIds: [],
      items: [
        {
          artifactId: 'pptmaster-app-shell-artifact-project-preview-bundle',
          kind: 'preview_bundle',
          title: 'Preview bundle manifest',
          storageKey: 'projects/pptmaster-app-shell-artifact-project/preview/index.json',
          filename: 'index.json',
          mimeType: 'application/json',
          role: 'bundle',
        },
      ],
    },
  });

  assert.match(bundleOnlyPreviewHtml, /Preview assets/, 'bundle-only preview should still render the preview panel');
  assert.doesNotMatch(bundleOnlyPreviewHtml, /data-preview-page-focus="true"/, 'preview page focus surface should remain absent when no page artifacts exist');

  const recoveryHtml = renderProjectWorkbenchShell(makeRecoveryShellView());

  assert.match(recoveryHtml, /PPTMASTER App Shell Recovery Project/);
  assert.match(recoveryHtml, /revision_requested/);
  assert.match(recoveryHtml, /<a class="skip-link" href="#panel-recovery">Skip to primary workbench panel<\/a>/);
  assert.match(recoveryHtml, /data-target="recovery" data-primary-panel="true"/);
  assert.match(recoveryHtml, /href="#panel-recovery" aria-current="page"/);
  assert.match(recoveryHtml, /href="#panel-recovery"/);
  assert.match(recoveryHtml, /href="#panel-next-actions"/);
  assert.match(recoveryHtml, /projects\/pptmaster-app-shell-recovery-project\/preview\/index\.json/);
  assert.match(recoveryHtml, /index\.json/);
  assert.match(recoveryHtml, /application\/json/);
  assert.match(recoveryHtml, /01_cover\.svg/);
  assert.match(recoveryHtml, /image\/svg\+xml/);
  assert.match(recoveryHtml, /data-panel="recovery"/);
  assert.match(recoveryHtml, /Tighten the page 1 headline before export\./);
  assert.match(recoveryHtml, /resume_generation/);
  assert.match(recoveryHtml, /<li>pptmaster-app-shell-recovery-project-revision-log<\/li>/);
  assert.match(recoveryHtml, /<h2[^>]*>Next actions<\/h2>/);
  assert.match(recoveryHtml, /resume required/);
  assert.match(recoveryHtml, /Resume remains blocked until the pending revision note is addressed and generation can continue\./);
  assert.match(recoveryHtml, /Resume blocked/);
  assert.match(recoveryHtml, /Bridge gap/);
  assert.match(recoveryHtml, /Primary recovery path/);
  assert.match(recoveryHtml, /Resume generation/);
  assert.match(recoveryHtml, /data-action-code="resume_generation"/);
  assert.match(recoveryHtml, /Apply the revision note, then resume the generation pass from the latest checkpoint\./);
  assert.match(recoveryHtml, /Latest checkpoint/);
  assert.match(recoveryHtml, /checkpoint-revision-requested-001/);
  assert.doesNotMatch(recoveryHtml, /checkpoint-generation-started-001/, 'revision recovery should surface the latest blocking checkpoint instead of any older start marker');
  assert.match(recoveryHtml, /Blocking detail/);
  assert.match(recoveryHtml, /data-panel="workbench-sections"/);
  assert.match(recoveryHtml, /2 complete · 1 upcoming/, 'recovery workflow status should reflect the projected section states');

  const failedRecoverableHtml = renderProjectWorkbenchShell(makeFailedRecoverableShellView());

  assert.match(failedRecoverableHtml, /PPTMASTER App Shell Failed Project/);
  assert.match(failedRecoverableHtml, /failed_recoverable/);
  assert.match(failedRecoverableHtml, /<a class="skip-link" href="#panel-recovery">Skip to primary workbench panel<\/a>/);
  assert.match(failedRecoverableHtml, /data-panel="recovery"/);
  assert.match(failedRecoverableHtml, /href="#panel-next-actions"/);
  assert.match(failedRecoverableHtml, /Recoverable failure/);
  assert.match(failedRecoverableHtml, /Executor runtime bridge is not available in the product shell\./);
  assert.match(failedRecoverableHtml, /<h2[^>]*>Next actions<\/h2>/);
  assert.match(failedRecoverableHtml, /No automatic next action is available in the product shell yet; recovery stays blocked until the recovery bridge exists\./);
  assert.match(failedRecoverableHtml, /No auto-recovery/);
  assert.match(failedRecoverableHtml, /Bridge gap/);
  assert.match(failedRecoverableHtml, /Recovery bridge required/);
  assert.match(failedRecoverableHtml, /data-action-code="recovery_bridge_required"/);
  assert.match(failedRecoverableHtml, /The product shell has no recovery bridge yet, so the workflow cannot continue until that bridge exists\./);
  assert.match(failedRecoverableHtml, /Workflow state/);
  assert.match(failedRecoverableHtml, /Blocking detail/);
  assert.match(failedRecoverableHtml, />blocked<|blocked<\/span>/);

  const terminalFailureHtml = renderProjectWorkbenchShell(makeTerminalFailureShellView());

  assert.match(terminalFailureHtml, /PPTMASTER App Shell Terminal Project/);
  assert.match(terminalFailureHtml, /failed_terminal/);
  assert.match(terminalFailureHtml, /<a class="skip-link" href="#panel-recovery">Skip to primary workbench panel<\/a>/);
  assert.match(terminalFailureHtml, /href="#panel-recovery"/);
  assert.match(terminalFailureHtml, /href="#panel-next-actions"/);
  assert.match(terminalFailureHtml, /Terminal failure/);
  assert.match(terminalFailureHtml, /Manual intervention required/);
  assert.match(terminalFailureHtml, /No automatic next action is available after a terminal failure; manual investigation is required before the workflow can continue\./);
  assert.match(terminalFailureHtml, /Executor process exited before producing preview assets\./);
  assert.match(terminalFailureHtml, /No auto-recovery/);
  assert.match(terminalFailureHtml, /Manual investigation/);
  assert.match(terminalFailureHtml, /data-action-code="manual_investigation"/);
  assert.match(terminalFailureHtml, /The product shell cannot continue automatically after a terminal failure\. An operator must inspect the failing runtime first\./);
  assert.match(terminalFailureHtml, /manual investigation required/);
  assert.match(terminalFailureHtml, /data-panel="recovery"/);
  assert.match(terminalFailureHtml, /data-panel="next-actions"/);
  assert.match(terminalFailureHtml, /Workflow state/);
  assert.match(terminalFailureHtml, /Blocking detail/);
  assert.match(terminalFailureHtml, />blocked<|blocked<\/span>/);

  console.log('project workbench app shell render test: ok');
}

void main();
