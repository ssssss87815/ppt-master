import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects.js';
import type { ProductArtifactRef } from '../models/artifacts.js';
import type { ConfirmationRecommendation } from '../models/confirmations.js';
import type { ProjectStatus } from '../state/schema.js';
import type { SubmitConfirmationsAction } from '../models/actions.js';
import {
  toConfirmationSubmissionQuestionViewModel,
  type ConfirmationSubmissionViewModel,
} from '../../app/viewmodels/confirmation-submission-view-model.js';
import type {
  ProjectTimelineItemViewModel,
  ProjectWorkbenchSectionViewModel,
  StrategistHandoffViewModel,
  ProjectViewModel,
} from '../../app/viewmodels/project-view-model.js';

type PreviewItem = NonNullable<NonNullable<ProjectViewModel['preview']>['items']>[number];

const STATUS_TITLES: Record<ProjectStatus, string> = {
  draft: 'Draft',
  sources_ready: 'Sources ready',
  confirmation_pending: 'Confirmation pending',
  confirmation_locked: 'Confirmations locked',
  spec_ready: 'Spec ready',
  generation_in_progress: 'Generation in progress',
  preview_available: 'Preview available',
  revision_requested: 'Revision requested',
  export_ready: 'Export ready',
  failed_recoverable: 'Recoverable failure',
  failed_terminal: 'Terminal failure',
};

const STATUS_DESCRIPTIONS: Record<ProjectStatus, string> = {
  draft: 'Project workspace exists, but source intake has not been imported yet.',
  sources_ready: 'Source intake has been imported and normalized into product-visible artifacts.',
  confirmation_pending: 'Confirmation recommendations are ready and waiting for answers.',
  confirmation_locked: 'Confirmation answers are locked and ready for strategist processing.',
  spec_ready: 'Strategist handoff artifacts are ready to gate generation entry.',
  generation_in_progress: 'Page generation is underway in the productized workflow.',
  preview_available: 'Preview artifacts are available for review.',
  revision_requested: 'A revision was requested before export can proceed.',
  export_ready: 'Export and delivery artifacts are available.',
  failed_recoverable: 'The workflow paused on a recoverable failure and needs intervention.',
  failed_terminal: 'The workflow stopped on a terminal failure and requires manual investigation.',
};

const CHECKPOINT_STATUS_TITLES: Record<WorkflowCheckpoint['status'], string> = {
  started: 'Started',
  completed: 'Completed',
  failed: 'Failed',
};

function stageTitle(stage: WorkflowCheckpoint['stage']): string {
  return {
    project_created: 'Project created',
    sources_imported: 'Sources imported',
    confirmations_prepared: 'Confirmations prepared',
    confirmations_locked: 'Confirmations Locked',
    strategist_artifacts_synced: 'Strategist artifacts synced',
    generation_started: 'Generation Started',
    generation_resumed: 'Generation Resumed',
    preview_synced: 'Preview synced',
    revision_requested: 'Revision requested',
    export_ready: 'Export ready',
  }[stage];
}

function checkpointStorageKey(project: ProjectRecord, checkpointId: string): string {
  return `projects/${project.projectId}/checkpoints/${checkpointId}.json`;
}

const WORKFLOW_MILESTONE_RANK: Partial<Record<ProjectStatus, number>> = {
  draft: 0,
  sources_ready: 1,
  confirmation_pending: 2,
  confirmation_locked: 3,
  spec_ready: 4,
  generation_in_progress: 5,
  preview_available: 6,
  export_ready: 7,
};

function hasReached(projectStatus: ProjectStatus, milestone: ProjectStatus): boolean {
  const projectRank = WORKFLOW_MILESTONE_RANK[projectStatus];
  const milestoneRank = WORKFLOW_MILESTONE_RANK[milestone];

  return projectRank !== undefined && milestoneRank !== undefined && projectRank >= milestoneRank;
}

function sortArtifactsNewestFirst(artifacts: ProductArtifactRef[]): ProductArtifactRef[] {
  return [...artifacts].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function latestArtifactByKind(artifacts: ProductArtifactRef[], kind: ProductArtifactRef['kind']): ProductArtifactRef | undefined {
  return sortArtifactsNewestFirst(artifacts).find((artifact) => artifact.kind === kind);
}

function buildSources(artifacts: ProductArtifactRef[]): ProjectViewModel['sources'] {
  const normalizedBySourceId = new Set(
    artifacts
      .filter((artifact) => artifact.kind === 'source_normalized')
      .map((artifact) => artifact.sourceId ?? artifact.artifactId),
  );

  return artifacts
    .filter((artifact) => artifact.kind === 'source_original')
    .map((artifact) => {
      const sourceId = artifact.sourceId ?? artifact.artifactId;
      return {
        sourceId,
        label: artifact.label ?? artifact.artifactId,
        kind: 'text' as const,
        status: normalizedBySourceId.has(sourceId) ? 'normalized' as const : 'uploaded' as const,
      };
    });
}

function buildArtifactSummary(artifacts: ProductArtifactRef[]): NonNullable<ProjectViewModel['artifactSummary']> {
  return {
    total: artifacts.length,
    planned: artifacts.length,
    pending: artifacts.filter((artifact) => artifact.status === 'pending' || artifact.status === 'planned').length,
    ready: artifacts.filter((artifact) => artifact.status === 'ready').length,
    locked: artifacts.filter((artifact) => artifact.status === 'locked').length,
    superseded: artifacts.filter((artifact) => artifact.status === 'superseded').length,
    failed: artifacts.filter((artifact) => artifact.status === 'failed').length,
    byKind: artifacts.reduce<Partial<Record<ProductArtifactRef['kind'], number>>>((acc, artifact) => {
      acc[artifact.kind] = (acc[artifact.kind] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

function buildStrategistHandoff(artifacts: ProductArtifactRef[]): ProjectViewModel['workbench']['strategistHandoff'] {
  const strategistArtifacts = sortArtifactsNewestFirst(artifacts).filter(
    (artifact) => artifact.kind === 'design_spec' || artifact.kind === 'spec_lock',
  );

  if (!strategistArtifacts.length) {
    return undefined;
  }

  const projectedArtifacts = strategistArtifacts.map((artifact) => {
    const verified =
      (artifact.kind === 'design_spec' && artifact.status === 'ready') ||
      (artifact.kind === 'spec_lock' && artifact.status === 'locked');
    const verificationState = verified
      ? 'verified' as const
      : 'pending_runtime_verification' as const;

    return {
      artifactId: artifact.artifactId,
      kind: artifact.kind as 'design_spec' | 'spec_lock',
      label: artifact.label,
      status: artifact.status,
      verificationState,
      storageKey: artifact.storageKey,
    };
  });

  const hasVerifiedDesignSpec = projectedArtifacts.some(
    (artifact) => artifact.kind === 'design_spec' && artifact.verificationState === 'verified',
  );
  const hasVerifiedSpecLock = projectedArtifacts.some(
    (artifact) => artifact.kind === 'spec_lock' && artifact.verificationState === 'verified',
  );
  const verifiedArtifactCount = projectedArtifacts.filter(
    (artifact) => artifact.verificationState === 'verified',
  ).length;
  const pendingArtifactCount = projectedArtifacts.length - verifiedArtifactCount;
  const gateStatus = hasVerifiedDesignSpec && hasVerifiedSpecLock
    ? 'verified' as const
    : 'pending_runtime_verification' as const;

  return {
    gateStatus,
    summary: gateStatus === 'verified'
      ? 'Design spec and spec lock are verified for generation.'
      : 'Design spec and spec lock exist, but runtime bridge verification is still pending.',
    detail: gateStatus === 'verified'
      ? 'Generation may proceed because both strategist handoff artifacts are present and verified by the runtime bridge.'
      : 'Keep generation blocked until both strategist handoff artifacts clear runtime verification. The product shell should not treat file presence alone as enough proof.',
    panelStatus: gateStatus === 'verified' ? 'complete' : 'warning',
    verificationBadgeTone: gateStatus === 'verified' ? 'success' : 'warning',
    verificationBadgeText: gateStatus === 'verified' ? 'Runtime bridge verified' : 'Pending runtime bridge verification',
    gateLabel: gateStatus === 'verified' ? 'Verified handoff' : 'Verification pending',
    verifiedArtifactCount,
    pendingArtifactCount,
    generationGateCopy: gateStatus === 'verified'
      ? 'Generation handoff unlocked: runtime verification is complete.'
      : 'Generation handoff locked: wait for runtime bridge verification before starting page generation.',
    artifacts: projectedArtifacts,
  };
}

function buildConfirmationSubmission(
  project: ProjectRecord,
  recommendations: ConfirmationRecommendation[],
  confirmationResultArtifact?: ProductArtifactRef,
): ConfirmationSubmissionViewModel | undefined {
  if (!recommendations.length) {
    return undefined;
  }

  const answers = confirmationResultArtifact?.metadata?.answers;
  const answerMap = answers && typeof answers === 'object' ? answers as Record<string, unknown> : {};
  const questions = recommendations.map((recommendation) => {
    const answer = answerMap[recommendation.key];
    return toConfirmationSubmissionQuestionViewModel(
      recommendation,
      typeof answer === 'string' ? answer : undefined,
    );
  });
  const completedCount = questions.filter((question) => question.isAnswered).length;
  const isComplete = completedCount === questions.length;
  const status = confirmationResultArtifact ? 'submitted' as const : 'ready' as const;

  const submitAction: SubmitConfirmationsAction['payload'] = {
    projectId: project.projectId,
    confirmationSetId: project.projectId,
    answers: Object.fromEntries(
      questions.map((question) => [question.key, question.answer]),
    ) as SubmitConfirmationsAction['payload']['answers'],
  };

  return {
    projectId: project.projectId,
    status,
    bannerTone: status === 'submitted' ? 'success' : 'active',
    bannerText: status === 'submitted'
      ? `${completedCount}/${questions.length} confirmation answers locked and ready for strategist handoff.`
      : `${questions.length} confirmation answers ready for input.`,
    completion: {
      completedCount,
      totalCount: questions.length,
      isComplete,
    },
    questions,
    submitAction: status === 'ready'
      ? {
          type: 'submit_confirmations',
          projectId: project.projectId,
          confirmationSetId: project.projectId,
          payload: submitAction,
        }
      : {
          type: 'submit_confirmations',
          projectId: project.projectId,
          confirmationSetId: project.projectId,
          payload: submitAction,
        },
  };
}

function buildTimeline(
  project: ProjectRecord,
  sources: ProjectViewModel['sources'],
  confirmationSubmission: ProjectViewModel['workbench']['confirmationSubmission'],
  strategistHandoff: ProjectViewModel['workbench']['strategistHandoff'],
  hasPreview: boolean,
  hasExport: boolean,
): ProjectTimelineItemViewModel[] {
  const confirmationCurrent = Boolean(confirmationSubmission && confirmationSubmission.status === 'ready');
  const strategistCurrent = !confirmationCurrent
    && project.status === 'spec_ready';
  const previewCurrent = !confirmationCurrent
    && !strategistCurrent
    && project.status === 'generation_in_progress';
  const exportCurrent = project.status === 'preview_available';

  return [
    {
      key: 'sources',
      status: 'sources_ready',
      title: 'Source intake',
      description: sources.length
        ? `${sources.length} source artifact(s) imported into the workbench.`
        : 'Import source material into the workbench.',
      reached: sources.length > 0,
      isCurrent: false,
      isNext: !sources.length,
    },
    {
      key: 'confirmations',
      status: 'confirmation_pending',
      title: 'Confirmation status',
      description: confirmationSubmission
        ? confirmationSubmission.bannerText
        : 'Prepare and answer the eight confirmations before generation begins.',
      reached: Boolean(confirmationSubmission),
      isCurrent: confirmationCurrent,
      isNext: !confirmationSubmission,
    },
    {
      key: 'strategist',
      status: 'spec_ready',
      title: 'Strategist runtime verification',
      description: strategistHandoff?.summary ?? 'Strategist handoff artifacts must materialize before generation can start.',
      reached: Boolean(strategistHandoff),
      isCurrent: strategistCurrent,
      isNext: Boolean(confirmationSubmission?.status === 'submitted' && !strategistHandoff),
    },
    {
      key: 'preview',
      status: 'generation_in_progress',
      title: 'Preview assets',
      description: hasPreview
        ? 'Preview artifacts are visible in the workbench.'
        : 'Page generation is producing preview assets.',
      reached: hasPreview || hasReached(project.status, 'generation_in_progress'),
      isCurrent: previewCurrent,
      isNext: Boolean(strategistHandoff?.gateStatus === 'verified' && !hasPreview && project.status === 'spec_ready'),
    },
    {
      key: 'export',
      status: 'export_ready',
      title: 'Export assets',
      description: hasExport
        ? 'Export and delivery artifacts are ready.'
        : 'Package preview output into export artifacts.',
      reached: hasExport,
      isCurrent: exportCurrent,
      isNext: Boolean(hasPreview && !hasExport && project.status !== 'revision_requested'),
    },
  ];
}

function buildTimelineSections(
  timeline: ProjectTimelineItemViewModel[],
  project: ProjectRecord,
  sources: ProjectViewModel['sources'],
  strategistHandoff: ProjectViewModel['workbench']['strategistHandoff'],
  previewPageCount: number,
  hasExport: boolean,
): ProjectWorkbenchSectionViewModel[] {
  return timeline.map((item): ProjectWorkbenchSectionViewModel => {
    if (item.status === 'sources_ready') {
      return {
        key: 'sources',
        title: item.title,
        status: sources.length ? 'complete' : 'upcoming',
        summary: item.description ?? 'Import source material into the workbench.',
        description: item.description,
        badges: sources.length ? [{ tone: 'success', text: `${sources.length} source${sources.length === 1 ? '' : 's'}` }] : undefined,
      };
    }

    if (item.status === 'confirmation_pending') {
      return {
        key: 'confirmations',
        title: item.title,
        status: item.isCurrent ? 'current' : item.reached ? 'complete' : 'upcoming',
        summary: item.description ?? 'Prepare and answer the eight confirmations before generation begins.',
        description: 'Review and lock the eight confirmations before strategist handoff and generation.',
        action: item.isCurrent ? 'submit_confirmations' : undefined,
        badges: item.isCurrent
          ? [{ tone: 'active', text: 'Awaiting answers' }]
          : item.reached
            ? [{ tone: 'success', text: 'Locked' }]
            : undefined,
      };
    }

    if (item.status === 'spec_ready') {
      const strategistPending = strategistHandoff?.gateStatus === 'pending_runtime_verification';
      return {
        key: 'strategist',
        title: item.title,
        status: strategistPending ? 'warning' : item.isCurrent ? 'current' : item.reached ? 'complete' : 'upcoming',
        summary: strategistPending
          ? 'Strategist handoff is blocked by runtime verification.'
          : item.description ?? 'Strategist handoff artifacts must materialize before generation can start.',
        description: strategistPending
          ? 'A real strategist runtime bridge exists, but its artifacts still need verification.'
          : 'Strategist artifacts gate generation entry for the product shell.',
        badges: strategistHandoff
          ? [{ tone: strategistPending ? 'warning' : 'success', text: strategistPending ? 'Unverified runtime output' : 'Strategist verified' }]
          : undefined,
      };
    }

    if (item.status === 'generation_in_progress') {
      return {
        key: 'preview',
        title: 'Preview',
        status: previewPageCount > 0 ? 'complete' : item.isCurrent ? 'current' : 'upcoming',
        summary: previewPageCount > 0
          ? `${previewPageCount} preview page asset${previewPageCount === 1 ? '' : 's'} available.`
          : 'Sync preview from workspace SVG outputs.',
        description: item.description,
        badges: [{ tone: previewPageCount > 0 ? 'success' : 'neutral', text: `${previewPageCount} preview page(s)` }],
      };
    }

    return {
      key: 'export',
      title: 'Delivery Export',
      status: hasExport ? 'complete' : item.isCurrent ? 'current' : project.status === 'revision_requested' ? 'upcoming' : 'upcoming',
      summary: hasExport ? 'Produce final PPTX and companion artifacts.' : 'Produce final PPTX and companion artifacts.',
      description: item.description,
      action: item.isCurrent || hasExport ? 'export_pptx' : undefined,
      badges: [{ tone: hasExport ? 'success' : 'neutral', text: hasExport ? 'Export ready' : 'No export yet' }],
    };
  });
}

function nextActionsFor(
  project: ProjectRecord,
  confirmationSubmission: ConfirmationSubmissionViewModel | undefined,
  strategistHandoff: StrategistHandoffViewModel | undefined,
  hasRuntimeBackedPreview: boolean,
  hasRuntimeBackedExport: boolean,
): ProjectViewModel['nextActions'] {
  if (project.status === 'draft') {
    return ['import_sources'];
  }

  if (project.status === 'sources_ready') {
    return ['prepare_confirmations'];
  }

  if (confirmationSubmission?.status === 'ready') {
    return ['submit_confirmations'];
  }

  if ((project.status === 'confirmation_locked' || project.status === 'spec_ready') && strategistHandoff?.gateStatus === 'verified') {
    return ['start_generation'];
  }

  if (project.status === 'revision_requested') {
    return ['resume_generation'];
  }

  if (project.status === 'generation_in_progress' && hasRuntimeBackedExport) {
    return ['export_pptx'];
  }

  if (project.status === 'preview_available' && hasRuntimeBackedPreview && !hasRuntimeBackedExport) {
    return ['export_pptx'];
  }

  return [];
}

function buildLatestRevisionRequest(project: ProjectRecord, artifacts: ProductArtifactRef[]): ProjectViewModel['latestRevisionRequest'] {
  const candidate = sortArtifactsNewestFirst(artifacts).find((artifact) => {
    if (artifact.kind !== 'runtime_log' || typeof artifact.metadata?.note !== 'string') {
      return false;
    }

    if (project.latestRevisionRequestId) {
      return artifact.artifactId === project.latestRevisionRequestId;
    }

    return artifact.storageKey.includes('revision') || artifact.label?.toLowerCase().includes('revision') === true;
  });

  if (!candidate || typeof candidate.metadata?.note !== 'string') {
    return undefined;
  }

  return {
    revisionId: candidate.artifactId,
    note: candidate.metadata.note,
    status: 'requested',
    requestedAt: candidate.createdAt,
    sourceStatus: 'preview_available',
    targetStatus: 'revision_requested',
    checkpointId: project.latestCheckpointId,
  };
}

function isCurrentReadyRuntimeArtifact(project: ProjectRecord, artifact: ProductArtifactRef): boolean {
  return artifact.status === 'ready' && artifact.runId === project.lastRunId;
}

function hasCompletedCheckpointForArtifacts(
  checkpoint: WorkflowCheckpoint | undefined,
  stage: WorkflowCheckpoint['stage'],
  artifacts: ProductArtifactRef[],
): boolean {
  if (!checkpoint || checkpoint.stage !== stage || checkpoint.status !== 'completed') {
    return false;
  }

  const artifactIds = new Set(checkpoint.artifactIds);
  return artifacts.length > 0 && artifacts.every((artifact) => artifactIds.has(artifact.artifactId));
}

function hasCompletedCheckpointForCurrentRunArtifacts(
  checkpoints: WorkflowCheckpoint[] | undefined,
  stage: WorkflowCheckpoint['stage'],
  artifacts: ProductArtifactRef[],
): boolean {
  return (checkpoints ?? []).some((checkpoint) => hasCompletedCheckpointForArtifacts(checkpoint, stage, artifacts));
}

type CompletedCheckpointArtifactSelection<T> =
  | { status: 'found'; value: T }
  | { status: 'ambiguous' }
  | { status: 'absent' };

function uniqueArtifactsById(artifacts: ProductArtifactRef[]): Map<string, ProductArtifactRef[]> {
  const artifactsById = new Map<string, ProductArtifactRef[]>();

  for (const artifact of artifacts) {
    const matchingArtifacts = artifactsById.get(artifact.artifactId) ?? [];
    matchingArtifacts.push(artifact);
    artifactsById.set(artifact.artifactId, matchingArtifacts);
  }

  return artifactsById;
}

function checkpointArtifactsFromCurrentRun(
  checkpoint: WorkflowCheckpoint,
  artifactsById: Map<string, ProductArtifactRef[]>,
): CompletedCheckpointArtifactSelection<ProductArtifactRef[]> {
  const checkpointArtifacts: ProductArtifactRef[] = [];
  const referencedArtifactIds = new Set<string>();

  for (const artifactId of checkpoint.artifactIds) {
    if (referencedArtifactIds.has(artifactId)) {
      return { status: 'ambiguous' };
    }
    referencedArtifactIds.add(artifactId);

    const matchingArtifacts = artifactsById.get(artifactId) ?? [];
    if (matchingArtifacts.length > 1) {
      return { status: 'ambiguous' };
    }
    if (matchingArtifacts.length === 1) {
      checkpointArtifacts.push(matchingArtifacts[0]);
    }
  }

  return { status: 'found', value: checkpointArtifacts };
}

function previewArtifactsFromCompletedCheckpoint(
  checkpoints: WorkflowCheckpoint[],
  readyCurrentRunArtifacts: ProductArtifactRef[],
): CompletedCheckpointArtifactSelection<{ bundle: ProductArtifactRef; pages: ProductArtifactRef[] }> {
  const artifactsById = uniqueArtifactsById(readyCurrentRunArtifacts);

  for (const checkpoint of [...checkpoints].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    if (checkpoint.stage !== 'preview_synced' || checkpoint.status !== 'completed') {
      continue;
    }

    const checkpointArtifactSelection = checkpointArtifactsFromCurrentRun(checkpoint, artifactsById);
    if (checkpointArtifactSelection.status === 'ambiguous') {
      return checkpointArtifactSelection;
    }

    const checkpointArtifacts = checkpointArtifactSelection.value;
    const bundle = checkpointArtifacts.find((artifact) => artifact.kind === 'preview_bundle');

    if (bundle) {
      return {
        status: 'found',
        value: {
          bundle,
          pages: checkpointArtifacts.filter((artifact) => artifact.kind === 'preview_page_svg'),
        },
      };
    }
  }

  return { status: 'absent' };
}

function exportArtifactFromCompletedCheckpoint(
  checkpoints: WorkflowCheckpoint[],
  readyCurrentRunArtifacts: ProductArtifactRef[],
): CompletedCheckpointArtifactSelection<ProductArtifactRef> {
  const artifactsById = uniqueArtifactsById(readyCurrentRunArtifacts);

  for (const checkpoint of [...checkpoints].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    if (checkpoint.stage !== 'export_ready' || checkpoint.status !== 'completed') {
      continue;
    }

    const checkpointArtifactSelection = checkpointArtifactsFromCurrentRun(checkpoint, artifactsById);
    if (checkpointArtifactSelection.status === 'ambiguous') {
      return checkpointArtifactSelection;
    }

    const exportArtifact = checkpointArtifactSelection.value.find((artifact) => artifact.kind === 'export_pptx');

    if (exportArtifact) {
      return { status: 'found', value: exportArtifact };
    }
  }

  return { status: 'absent' };
}

export function toProjectViewModel(
  project: ProjectRecord,
  artifacts: ProductArtifactRef[],
  recommendations: ConfirmationRecommendation[],
  latestCheckpoint?: WorkflowCheckpoint,
  lastStartedCheckpoint?: WorkflowCheckpoint,
  checkpoints?: WorkflowCheckpoint[],
): ProjectViewModel {
  const artifactStorageKeyById = new Map(artifacts.map((artifact) => [artifact.artifactId, artifact.storageKey]));
  const sources = buildSources(artifacts);
  const readyCurrentRunArtifacts = artifacts.filter((artifact) => isCurrentReadyRuntimeArtifact(project, artifact));
  const currentRunCheckpoints = checkpoints ?? [latestCheckpoint].filter(
    (checkpoint): checkpoint is WorkflowCheckpoint => Boolean(checkpoint),
  );
  const checkpointPreviewArtifactSelection = previewArtifactsFromCompletedCheckpoint(currentRunCheckpoints, readyCurrentRunArtifacts);
  const checkpointPreviewArtifacts = checkpointPreviewArtifactSelection.status === 'found'
    ? checkpointPreviewArtifactSelection.value
    : undefined;
  const candidatePreviewBundle = checkpointPreviewArtifactSelection.status === 'ambiguous'
    ? undefined
    : checkpointPreviewArtifacts?.bundle
      ?? latestArtifactByKind(readyCurrentRunArtifacts, 'preview_bundle');
  const candidatePreviewPageArtifacts = checkpointPreviewArtifactSelection.status === 'ambiguous'
    ? []
    : checkpointPreviewArtifacts?.pages
      ?? sortArtifactsNewestFirst(readyCurrentRunArtifacts)
        .filter((artifact) => artifact.kind === 'preview_page_svg');
  const previewArtifacts = candidatePreviewBundle
    ? [candidatePreviewBundle, ...candidatePreviewPageArtifacts]
    : [];
  const checkpointExportArtifactSelection = exportArtifactFromCompletedCheckpoint(currentRunCheckpoints, readyCurrentRunArtifacts);
  const candidateExportArtifact = checkpointExportArtifactSelection.status === 'ambiguous'
    ? undefined
    : checkpointExportArtifactSelection.status === 'found'
      ? checkpointExportArtifactSelection.value
      : latestArtifactByKind(readyCurrentRunArtifacts, 'export_pptx');
  const exportIsRuntimeBacked = candidateExportArtifact
    ? hasCompletedCheckpointForCurrentRunArtifacts(currentRunCheckpoints, 'export_ready', [candidateExportArtifact])
    : false;
  const latestExportArtifact = exportIsRuntimeBacked ? candidateExportArtifact : undefined;
  const previewIsRuntimeBacked = hasCompletedCheckpointForCurrentRunArtifacts(currentRunCheckpoints, 'preview_synced', previewArtifacts)
    || exportIsRuntimeBacked;
  const previewBundle = previewIsRuntimeBacked ? candidatePreviewBundle : undefined;
  const previewPageArtifacts = previewIsRuntimeBacked ? candidatePreviewPageArtifacts : [];
  const confirmationResultArtifact = latestArtifactByKind(artifacts, 'confirmation_result');
  const strategistHandoff = buildStrategistHandoff(artifacts);
  const confirmationSubmission = buildConfirmationSubmission(project, recommendations, confirmationResultArtifact);
  const previewItems: PreviewItem[] = [
    ...(previewBundle ? [{
      artifactId: previewBundle.artifactId,
      kind: 'preview_bundle' as const,
      label: previewBundle.label,
      title: previewBundle.label ?? previewBundle.artifactId,
      storageKey: previewBundle.storageKey,
      filename: typeof previewBundle.metadata?.filename === 'string' ? previewBundle.metadata.filename : undefined,
      mimeType: previewBundle.mimeType,
      role: 'bundle' as const,
    }] : []),
    ...previewPageArtifacts.map<PreviewItem>((artifact) => ({
      artifactId: artifact.artifactId,
      kind: 'preview_page_svg' as const,
      label: artifact.label,
      title: typeof artifact.metadata?.title === 'string' ? artifact.metadata.title : artifact.label ?? artifact.artifactId,
      storageKey: artifact.storageKey,
      filename: typeof artifact.metadata?.filename === 'string'
        ? artifact.metadata.filename
        : typeof artifact.metadata?.generationProvenance === 'object'
          && artifact.metadata?.generationProvenance
          && typeof (artifact.metadata.generationProvenance as Record<string, unknown>).filename === 'string'
            ? (artifact.metadata.generationProvenance as Record<string, string>).filename
            : undefined,
      mimeType: artifact.mimeType,
      role: 'page' as const,
      pageKey: artifact.pageKey,
      generationProvenance: typeof artifact.metadata?.generationProvenance === 'object'
        && artifact.metadata?.generationProvenance
          ? artifact.metadata.generationProvenance as Record<string, unknown>
          : undefined,
    })),
  ];
  const latestPreviewUrl = previewBundle?.storageKey
    ? `/${previewBundle.storageKey}`
    : previewPageArtifacts[0]?.storageKey
      ? `/${previewPageArtifacts[0].storageKey}`
      : undefined;

  const companionArtifacts = latestExportArtifact
    ? sortArtifactsNewestFirst(artifacts).filter(
        (artifact) => artifact.artifactId !== latestExportArtifact.artifactId
          && artifact.runId === latestExportArtifact.runId
          && (artifact.kind === 'runtime_log' || artifact.kind === 'image_manifest'),
      )
    : [];
  const latestExportUrl = latestExportArtifact?.storageKey ? `/${latestExportArtifact.storageKey}` : undefined;
  const preview = previewItems.length > 0
    ? {
        latestPreviewUrl,
        pageCount: previewPageArtifacts.length,
        pageKeys: previewPageArtifacts.map((artifact) => artifact.pageKey).filter((value): value is string => Boolean(value)),
        manifestStorageKey: previewBundle?.storageKey,
        entryStorageKey: previewBundle?.storageKey,
        pageArtifactIds: previewPageArtifacts.map((artifact) => artifact.artifactId),
        runId: previewBundle?.runId ?? previewPageArtifacts[0]?.runId,
        items: previewItems,
      }
    : undefined;
  const exportView = latestExportArtifact
    ? {
        latestExportUrl,
        latestExportLabel: latestExportArtifact.label,
        format: 'pptx' as const,
        filename: typeof latestExportArtifact.metadata?.filename === 'string' ? latestExportArtifact.metadata.filename : undefined,
        manifestStorageKey: typeof latestExportArtifact.metadata?.manifestStorageKey === 'string'
          ? latestExportArtifact.metadata.manifestStorageKey
          : undefined,
        companionArtifactIds: companionArtifacts.map((artifact) => artifact.artifactId),
        companionStorageKeys: companionArtifacts.map((artifact) => artifact.storageKey),
        assetDirectoryStorageKey: typeof latestExportArtifact.metadata?.manifestStorageKey === 'string'
          ? latestExportArtifact.metadata.manifestStorageKey.replace(/\/image_manifest\.json$/, '')
          : undefined,
        runId: latestExportArtifact.runId,
        artifactCount: 1 + companionArtifacts.length,
        companionCount: companionArtifacts.length,
      }
    : undefined;
  const delivery = latestExportArtifact
    ? {
        primaryArtifactId: latestExportArtifact.artifactId,
        primaryStorageKey: latestExportArtifact.storageKey,
        primaryLabel: latestExportArtifact.label,
        companionArtifactIds: companionArtifacts.map((artifact) => artifact.artifactId),
        companionStorageKeys: companionArtifacts.map((artifact) => artifact.storageKey),
        assetDirectoryStorageKey: typeof latestExportArtifact.metadata?.manifestStorageKey === 'string'
          ? latestExportArtifact.metadata.manifestStorageKey.replace(/\/image_manifest\.json$/, '')
          : undefined,
        runId: latestExportArtifact.runId,
        items: [
          {
            artifactId: latestExportArtifact.artifactId,
            kind: latestExportArtifact.kind,
            label: latestExportArtifact.label,
            title: latestExportArtifact.label ?? latestExportArtifact.artifactId,
            storageKey: latestExportArtifact.storageKey,
            filename: typeof latestExportArtifact.metadata?.filename === 'string' ? latestExportArtifact.metadata.filename : undefined,
            mimeType: latestExportArtifact.mimeType,
            role: 'primary' as const,
          },
          ...companionArtifacts.map((artifact) => ({
            artifactId: artifact.artifactId,
            kind: artifact.kind,
            label: artifact.label,
            title: artifact.label ?? artifact.artifactId,
            storageKey: artifact.storageKey,
            filename: typeof artifact.metadata?.filename === 'string' ? artifact.metadata.filename : undefined,
            mimeType: artifact.mimeType,
            role: 'companion' as const,
          })),
        ],
      }
    : undefined;

  const timeline = buildTimeline(project, sources, confirmationSubmission, strategistHandoff, Boolean(preview), Boolean(exportView));
  const currentTimelineItem = timeline.find((item) => item.isCurrent)
    ?? timeline.find((item) => item.isNext)
    ?? timeline[timeline.length - 1];
  const workbenchSections = buildTimelineSections(
    timeline,
    project,
    sources,
    strategistHandoff,
    previewPageArtifacts.length,
    Boolean(exportView),
  );
  const latestRevisionRequest = buildLatestRevisionRequest(project, artifacts);
  const nextActions = nextActionsFor(
    project,
    confirmationSubmission,
    strategistHandoff,
    previewIsRuntimeBacked,
    exportIsRuntimeBacked,
  );
  const artifactSummary = buildArtifactSummary(artifacts);

  if (
    project.status === 'revision_requested'
    || project.status === 'failed_recoverable'
    || project.status === 'failed_terminal'
  ) {
    workbenchSections.push({
      key: 'recovery',
      title: project.status === 'revision_requested'
        ? 'Revision recovery'
        : project.status === 'failed_terminal'
          ? 'Terminal failure'
          : 'Recoverable failure',
      status: 'warning',
      summary: project.status === 'revision_requested'
        ? latestRevisionRequest?.note ?? latestCheckpoint?.note ?? 'A revision was requested before export.'
        : project.lastError ?? (project.status === 'failed_terminal'
            ? 'A terminal failure stopped the workflow.'
            : 'A recoverable failure paused the workflow.'),
      description: project.status === 'revision_requested'
        ? 'The deck has preview output, but the latest revision note must be addressed before export can resume.'
        : project.status === 'failed_terminal'
          ? 'The workflow cannot continue automatically after a terminal failure. Manual investigation is required.'
          : 'The workflow paused after a recoverable failure. Resume remains blocked until the recovery bridge exists.',
      action: project.status === 'revision_requested' ? 'resume_generation' : undefined,
      badges: [{
        tone: 'warning',
        text: project.status === 'revision_requested'
          ? 'Revision requested'
          : project.status === 'failed_terminal'
            ? 'Manual investigation required'
            : 'Recoverable failure',
      }],
    });
  }

  const summaryCards: ProjectViewModel['workbench']['summaryCards'] = [
    {
      key: 'sources',
      title: 'Sources',
      value: `${sources.length} intake`,
      tone: sources.length > 0 ? 'success' : 'neutral',
    },
    {
      key: 'confirmations',
      title: 'Confirmations',
      value: confirmationSubmission
        ? `${confirmationSubmission.completion.completedCount}/${confirmationSubmission.completion.totalCount} answered`
        : '0/0 answered',
      tone: confirmationSubmission?.status === 'submitted'
        ? 'success'
        : confirmationSubmission?.status === 'ready'
          ? 'warning'
          : 'neutral',
    },
    {
      key: 'strategist',
      title: 'Strategist',
      value: strategistHandoff
        ? strategistHandoff.gateStatus === 'verified'
          ? 'Verified'
          : 'Pending runtime verification'
        : 'Awaiting artifacts',
      tone: strategistHandoff
        ? strategistHandoff.gateStatus === 'verified' ? 'success' : 'warning'
        : 'neutral',
    },
    {
      key: 'preview',
      title: 'Preview',
      value: `${previewPageArtifacts.length} page(s)`,
      tone: previewPageArtifacts.length > 0 ? 'success' : 'neutral',
    },
    {
      key: 'export',
      title: 'Export',
      value: exportView ? 'Ready' : 'Pending',
      tone: exportView ? 'success' : 'neutral',
    },
    {
      key: 'artifacts',
      title: 'Artifacts',
      value: `${artifactSummary.ready}/${artifactSummary.planned} ready`,
      tone: artifactSummary.failed > 0 ? 'warning' : artifactSummary.ready > 0 ? 'success' : 'neutral',
    },
  ];

  return {
    projectId: project.projectId,
    name: project.name,
    status: project.status,
    workspacePath: project.workspace.workspacePath,
    title: STATUS_TITLES[project.status],
    description: STATUS_DESCRIPTIONS[project.status],
    currentPhase: {
      status: currentTimelineItem.status,
      title: currentTimelineItem.title,
      description: currentTimelineItem.description,
    },
    timeline,
    nextActions,
    latestPreviewUrl,
    latestExportUrl,
    preview,
    export: exportView,
    delivery,
    latestRevisionRequest,
    lastStartedCheckpoint: lastStartedCheckpoint
      ? {
          checkpointId: lastStartedCheckpoint.checkpointId,
          storageKey: artifactStorageKeyById.get(lastStartedCheckpoint.checkpointId) ?? checkpointStorageKey(project, lastStartedCheckpoint.checkpointId),
          stage: lastStartedCheckpoint.stage,
          stageTitle: stageTitle(lastStartedCheckpoint.stage),
          status: lastStartedCheckpoint.status,
          statusTitle: CHECKPOINT_STATUS_TITLES[lastStartedCheckpoint.status],
          title: stageTitle(lastStartedCheckpoint.stage),
          artifactIds: lastStartedCheckpoint.artifactIds,
          createdAt: lastStartedCheckpoint.createdAt,
          note: lastStartedCheckpoint.note,
        }
      : undefined,
    latestCheckpoint: latestCheckpoint
      ? {
          checkpointId: latestCheckpoint.checkpointId,
          storageKey: artifactStorageKeyById.get(latestCheckpoint.checkpointId) ?? checkpointStorageKey(project, latestCheckpoint.checkpointId),
          stage: latestCheckpoint.stage,
          stageTitle: stageTitle(latestCheckpoint.stage),
          status: latestCheckpoint.status,
          statusTitle: CHECKPOINT_STATUS_TITLES[latestCheckpoint.status],
          title: stageTitle(latestCheckpoint.stage),
          artifactIds: latestCheckpoint.artifactIds,
          createdAt: latestCheckpoint.createdAt,
          note: latestCheckpoint.note,
        }
      : undefined,
    artifactSummary,
    workbench: {
      timeline,
      currentTimelineItem,
      strategistHandoff,
      sections: workbenchSections,
      confirmationState: {
        hasRecommendations: recommendations.length > 0,
        hasConfirmationResult: Boolean(confirmationResultArtifact),
        recommendationCount: recommendations.length,
        answeredCount: confirmationSubmission?.completion.completedCount ?? 0,
        locked: confirmationSubmission?.status === 'submitted',
        displayStatus: confirmationSubmission
          ? confirmationSubmission.status === 'submitted'
            ? 'completed'
            : 'ready_for_review'
          : 'not_ready',
      },
      confirmationSubmission,
      summaryCards,
    },
    lastError: project.lastError,
    lastRunId: project.lastRunId,
    sources,
    confirmations: recommendations.map((recommendation) => ({
      key: recommendation.key,
      title: recommendation.title,
      recommendation: recommendation.recommendation,
      answer: confirmationSubmission?.questions.find((question) => question.key === recommendation.key)?.answer,
    })),
    artifacts: sortArtifactsNewestFirst(artifacts).map((artifact) => ({
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      status: artifact.status,
      label: artifact.label,
    })),
    lastUpdatedAt: project.updatedAt,
  };
}
