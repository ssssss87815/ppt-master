import type { ProjectRecord, ProjectStatus, WorkflowCheckpoint } from '../models/projects';
import type { ProductArtifactRef } from '../models/artifacts';
import type { SubmitConfirmationsAction } from '../models/actions';

const QUESTION_PLACEHOLDERS: Record<string, string> = {
  audience: 'Who is the primary audience for this deck?',
  goal: 'What is the primary outcome this deck should achieve?',
  tone: 'What tone should the presentation use?',
  language: 'Which language should the deck be authored in?',
  brand: 'What brand constraints or references should be applied?',
  outline: 'What narrative structure should the deck follow?',
  visual_style: 'What visual style direction should the deck use?',
  delivery: 'How will this deck be delivered or presented?',
};

export type ProjectViewModel = {
  projectId: string;
  name: string;
  status: ProjectStatus;
  title: string;
  description: string;
  currentPhase: {
    status: ProjectStatus;
    title: string;
    description: string;
  };
  timeline: Array<{
    key: string;
    title: string;
    summary: string;
    description: string;
    status: 'complete' | 'current' | 'upcoming';
    badges: Array<{ tone: 'success' | 'warning' | 'neutral'; text: string }>;
  }>;
  nextActions: string[];
  latestPreviewUrl?: string;
  latestExportUrl?: string;
  preview?: {
    latestPreviewArtifactId: string;
    latestPreviewUrl?: string;
    manifestStorageKey?: string;
    pageCount: number;
    pageArtifactIds: string[];
    items: Array<{
      artifactId: string;
      kind: string;
      label?: string;
      title: string;
      storageKey: string;
      filename?: string;
      mimeType?: string;
      pageKey?: string;
      generationProvenance?: unknown;
      role: 'bundle' | 'page';
    }>;
  };
  export?: {
    latestExportArtifactId: string;
    latestExportUrl?: string;
    latestExportLabel?: string;
    companionStorageKeys: string[];
    format?: 'pptx';
  };
  delivery?: {
    primaryArtifactId: string;
    primaryStorageKey: string;
    primaryLabel?: string;
    companionArtifactIds: string[];
    companionStorageKeys: string[];
    assetDirectoryStorageKey?: string;
    runId?: string;
    items: Array<{
      artifactId: string;
      kind: string;
      label?: string;
      title: string;
      storageKey: string;
      filename?: string;
      mimeType?: string;
      role: 'primary' | 'companion';
    }>;
  };
  latestCheckpoint?: {
    checkpointId: string;
    storageKey: string;
    stage: WorkflowCheckpoint['stage'];
    stageTitle: string;
    status: WorkflowCheckpoint['status'];
    statusTitle: string;
    title: string;
    artifactIds: string[];
    note?: string;
    createdAt: string;
  };
  lastStartedCheckpoint?: {
    checkpointId: string;
    storageKey: string;
    stage: WorkflowCheckpoint['stage'];
    stageTitle: string;
    status: WorkflowCheckpoint['status'];
    statusTitle: string;
    title: string;
    artifactIds: string[];
    note?: string;
    createdAt: string;
  };
  artifactSummary: {
    total: number;
    ready: number;
    failed: number;
    byKind: Record<string, number>;
  };
  workbench: {
    timeline: ProjectViewModel['timeline'];
    currentTimelineItem: ProjectViewModel['timeline'][number];
    summaryCards: Array<{
      key: string;
      title: string;
      value: string;
      tone: 'success' | 'warning' | 'neutral';
    }>;
    sections: Array<{
      key: string;
      title: string;
      summary: string;
      description: string;
      status: 'complete' | 'current' | 'upcoming' | 'warning';
      badges: Array<{ tone: 'success' | 'warning' | 'neutral'; text: string }>;
      action?: { label: string; variant: 'primary' | 'secondary' };
    }>;
    confirmationState: { hasRecommendations: boolean; hasConfirmationResult: boolean };
    confirmationSubmission?: {
      projectId: string;
      artifactId: string;
      storageKey: string;
      status: 'ready' | 'submitted' | 'not_ready';
      bannerText: string;
      completion: {
        completedCount: number;
        totalCount: number;
      };
      questions: Array<{
        key: string;
        title: string;
        recommendation: string;
        answer?: string;
        isAnswered: boolean;
        input: { placeholder: string };
      }>;
      recommendationCount: number;
      questionKeys: string[];
      submitAction?: SubmitConfirmationsAction & {
        projectId?: string;
        confirmationSetId?: string;
      };
    };
  };
  sources: Array<{ sourceId: string; label: string; kind: 'text'; status: 'uploaded' }>;
  confirmations: Array<{ key: string; title: string; recommendation: string }>;
  artifacts: Array<{ artifactId: string; kind: string; status: string; label?: string }>;
  lastUpdatedAt: string;
};

const STATUS_TITLES: Record<ProjectStatus, string> = {
  intake_uploaded: 'Intake uploaded',
  source_normalized: 'Source normalized',
  source_profiled: 'Source profiled',
  confirmations_generated: 'Confirmations generated',
  confirmations_locked: 'Confirmations locked',
  strategist_verified: 'Strategist verified',
  spec_ready: 'Spec ready',
  generation_in_progress: 'Generation in progress',
  preview_available: 'Preview available',
  export_ready: 'Export ready',
  revision_requested: 'Revision requested',
  failed_recoverable: 'Recoverable failure',
  failed_terminal: 'Terminal failure',
};

const PROJECT_STATUS_DESCRIPTIONS: Record<ProjectStatus, string> = {
  intake_uploaded: 'Source intake is available.',
  source_normalized: 'Source content has been normalized.',
  source_profiled: 'Source profile is ready.',
  confirmations_generated: 'Recommendations are ready for confirmation.',
  confirmations_locked: 'Confirmation result has been locked.',
  strategist_verified: 'Strategist bridge verification is complete.',
  spec_ready: 'Specification artifacts are ready.',
  generation_in_progress: 'Generation is underway.',
  preview_available: 'Preview artifacts are available.',
  export_ready: 'Export artifacts are available.',
  revision_requested: 'Revision has been requested.',
  failed_recoverable: 'A recoverable failure occurred.',
  failed_terminal: 'A terminal failure occurred.',
};

const CHECKPOINT_STATUS_TITLES: Record<WorkflowCheckpoint['status'], string> = {
  started: 'Started',
  completed: 'Completed',
  failed: 'Failed',
};

function stageTitle(stage: WorkflowCheckpoint['stage']): string {
  return {
    project_created: 'Project Created',
    sources_imported: 'Sources Imported',
    confirmations_prepared: 'Confirmations Prepared',
    confirmations_locked: 'Confirmations Locked',
    strategist_artifacts_synced: 'Strategist Artifacts Synced',
    generation_started: 'Generation Started',
    generation_resumed: 'Generation Resumed',
    preview_synced: 'Preview Synced',
    revision_requested: 'Revision Requested',
    export_ready: 'Export Ready',
  }[stage];
}

function checkpointStorageKey(project: ProjectRecord, checkpointId: string): string {
  return `projects/${project.projectId}/checkpoints/${checkpointId}.json`;
}

function nextActionsFor(status: ProjectStatus, flags: { strategistBridgeVerified: boolean }): string[] {
  if (status === 'spec_ready' && !flags.strategistBridgeVerified) return ['Verify strategist runtime bridge'];
  if (status === 'spec_ready') return ['Start generation'];
  if (status === 'generation_in_progress') return ['Sync preview', 'Export PPTX'];
  if (status === 'preview_available') return ['Export PPTX'];
  if (status === 'export_ready') return [];
  return [];
}

export function toProjectViewModel(
  project: ProjectRecord,
  artifacts: ProductArtifactRef[],
  recommendations: Array<{ key: string; title: string; recommendation: string }>,
  latestCheckpoint?: WorkflowCheckpoint,
  lastStartedCheckpoint?: WorkflowCheckpoint,
): ProjectViewModel {
  const artifactStorageKeyById = new Map(artifacts.map((item) => [item.artifactId, item.storageKey]));
  const previewPageArtifacts = artifacts.filter((item) => item.kind === 'preview_page_svg');
  const latestPreviewArtifact = artifacts.find((item) => item.kind === 'preview_bundle');
  const latestExportArtifact = artifacts.find((item) => item.kind === 'export_pptx');
  const latestConfirmationResultArtifact = artifacts.find((item) => item.kind === 'confirmation_result');
  const strategistArtifacts = artifacts.filter((item) => item.kind === 'design_spec' || item.kind === 'spec_lock');
  const strategistArtifactsRequireVerification = strategistArtifacts.filter((item) => item.metadata?.verification === 'unverified_runtime_bridge' || item.status === 'pending');
  const strategistBridgeVerified = strategistArtifacts.length > 0 && strategistArtifactsRequireVerification.length === 0;
  const strategistSectionStatus: 'complete' | 'upcoming' | 'warning' = project.status === 'spec_ready' || project.status === 'generation_in_progress' || project.status === 'preview_available' || project.status === 'export_ready'
    ? strategistBridgeVerified
      ? 'complete'
      : 'warning'
    : 'upcoming';
  const strategistSectionDescription = strategistBridgeVerified
    ? 'Strategist artifacts are verified and ready for the generation handoff.'
    : 'Strategist artifacts exist, but keep the handoff blocked until a real strategist runtime bridge exists and verification clears.';
  const strategistBadgeText = strategistBridgeVerified
    ? 'Strategist verified'
    : strategistArtifacts.length > 0
      ? 'Unverified runtime output'
      : 'Pending verification';

  const confirmationAnswers = latestConfirmationResultArtifact?.metadata && typeof latestConfirmationResultArtifact.metadata.answers === 'object'
    ? latestConfirmationResultArtifact.metadata.answers as Record<string, unknown>
    : {};
  const confirmationQuestions = recommendations.map((item) => {
    const answer = typeof confirmationAnswers[item.key] === 'string' ? confirmationAnswers[item.key] as string : '';
    return {
      key: item.key,
      title: item.title,
      recommendation: item.recommendation,
      answer,
      isAnswered: answer.length > 0,
      input: {
        placeholder: QUESTION_PLACEHOLDERS[item.key] ?? `Enter ${item.title.toLowerCase()}...`,
      },
    };
  });
  const confirmationCompletedCount = confirmationQuestions.filter((item) => item.isAnswered).length;
  const confirmationStatus: 'ready' | 'submitted' | 'not_ready' = recommendations.length === 0
    ? 'not_ready'
    : latestConfirmationResultArtifact
      ? 'submitted'
      : 'ready';
  const confirmationSubmitAction: (SubmitConfirmationsAction & { projectId?: string; confirmationSetId?: string }) | undefined = recommendations.length > 0
    ? {
        type: 'submit_confirmations',
        projectId: project.projectId,
        confirmationSetId: project.projectId,
        payload: {
          projectId: project.projectId,
          confirmationSetId: project.projectId,
          answers: Object.fromEntries(recommendations.map((item) => [item.key, confirmationAnswers[item.key] ?? ''])),
        },
      }
    : undefined;

  const artifactSummary = {
    total: artifacts.length,
    ready: artifacts.filter((item) => item.status === 'ready').length,
    failed: artifacts.filter((item) => item.status === 'failed').length,
    byKind: artifacts.reduce<Record<string, number>>((acc, item) => {
      acc[item.kind] = (acc[item.kind] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const timeline: ProjectViewModel['timeline'] = [
    {
      key: 'sources',
      title: 'Source Intake',
      summary: 'Upload and normalize the source material.',
      description: 'Upload and normalize the source material.',
      status: 'complete',
      badges: [{ tone: 'success', text: 'Source ready' }],
    },
    {
      key: 'confirmations',
      title: 'Confirmation status',
      summary: recommendations.length > 0
        ? `${recommendations.length} recommendations are ready for user review.`
        : 'No recommendations prepared yet.',
      description: 'Review and lock the eight confirmations before generation.',
      status: confirmationStatus === 'submitted' ? 'complete' : confirmationStatus === 'ready' ? 'current' : 'upcoming',
      badges: [{ tone: confirmationStatus === 'submitted' ? 'success' : confirmationStatus === 'ready' ? 'warning' : 'neutral', text: confirmationStatus === 'submitted' ? 'Locked' : confirmationStatus === 'ready' ? 'Awaiting answers' : 'Not ready' }],
      action: confirmationStatus === 'ready' ? confirmationSubmitAction.type : undefined,
    },
    {
      key: 'strategist',
      title: 'Strategist Bridge',
      summary: strategistBridgeVerified
        ? 'Strategist artifacts are verified for the generation handoff.'
        : 'Strategist artifacts need runtime verification before the handoff is treated as complete.',
      description: strategistSectionDescription,
      status: strategistSectionStatus,
      badges: [{ tone: strategistBridgeVerified ? 'success' : 'warning', text: strategistBadgeText }],
    },
    {
      key: 'preview',
      title: 'Preview',
      summary: 'Sync preview from workspace SVG outputs.',
      description: 'Sync preview from workspace SVG outputs.',
      status: project.status === 'preview_available' || project.status === 'export_ready' ? 'complete' : project.status === 'generation_in_progress' ? 'current' : 'upcoming',
      badges: [{ tone: previewPageArtifacts.length > 0 ? 'success' : 'neutral', text: `${previewPageArtifacts.length} preview page(s)` }],
    },
    {
      key: 'export',
      title: 'Delivery Export',
      summary: 'Produce final PPTX and companion artifacts.',
      description: 'Produce final PPTX and companion artifacts.',
      status: project.status === 'export_ready' ? 'complete' : project.status === 'preview_available' ? 'current' : 'upcoming',
      badges: [{ tone: latestExportArtifact ? 'success' : 'neutral', text: latestExportArtifact ? 'Export ready' : 'No export yet' }],
    },
  ];

  const currentTimelineItem = timeline.find((item) => item.status === 'current') ?? timeline[timeline.length - 1];
  const summaryCards: ProjectViewModel['workbench']['summaryCards'] = [
    { key: 'status', title: 'Status', value: STATUS_TITLES[project.status], tone: 'neutral' },
    { key: 'confirmations', title: 'Confirmations', value: `${confirmationCompletedCount}/${recommendations.length} answered`, tone: confirmationStatus === 'submitted' ? 'success' : confirmationStatus === 'ready' ? 'warning' : 'neutral' },
    { key: 'strategist', title: 'Strategist', value: strategistBridgeVerified ? 'Verified' : strategistArtifacts.length > 0 ? 'Pending runtime verification' : 'Awaiting artifacts', tone: strategistBridgeVerified ? 'success' : strategistArtifacts.length > 0 ? 'warning' : 'neutral' },
    { key: 'preview', title: 'Preview', value: `${previewPageArtifacts.length} page(s)`, tone: previewPageArtifacts.length > 0 ? 'success' : 'neutral' },
    { key: 'export', title: 'Export', value: latestExportArtifact ? 'Ready' : 'Pending', tone: latestExportArtifact ? 'success' : 'neutral' },
  ];

  const workbenchSections: ProjectViewModel['workbench']['sections'] = timeline.map((item) => ({
    key: item.key,
    title: item.title,
    summary: item.summary,
    description: item.description,
    status: item.status,
    badges: item.badges,
    action: item.action,
  }));

  const latestPreviewUrl = latestPreviewArtifact?.storageKey
    ? `/${latestPreviewArtifact.storageKey}`
    : previewPageArtifacts[0]?.storageKey
      ? `/${previewPageArtifacts[0].storageKey}`
      : undefined;

  const latestExportUrl = latestExportArtifact?.storageKey ? `/${latestExportArtifact.storageKey}` : undefined;
  const companionArtifactIdsFromMetadata = Array.isArray(latestExportArtifact?.metadata?.companionArtifacts)
    ? latestExportArtifact.metadata.companionArtifacts.filter((value): value is string => typeof value === 'string')
    : [];
  const companionArtifactIds = companionArtifactIdsFromMetadata.length > 0
    ? companionArtifactIdsFromMetadata
    : artifacts
        .filter((item) => item.runId === latestExportArtifact?.runId && item.artifactId !== latestExportArtifact?.artifactId && (item.kind === 'runtime_log' || item.kind === 'image_manifest'))
        .map((item) => item.artifactId);
  const companionStorageKeys = companionArtifactIds
    .map((artifactId) => artifactStorageKeyById.get(artifactId))
    .filter((value): value is string => typeof value === 'string');

  return {
    projectId: project.projectId,
    name: project.name,
    status: project.status,
    title: STATUS_TITLES[project.status],
    description: PROJECT_STATUS_DESCRIPTIONS[project.status],
    currentPhase: {
      status: project.status,
      title: currentTimelineItem.title,
      description: currentTimelineItem.description,
    },
    timeline,
    nextActions: nextActionsFor(project.status, { strategistBridgeVerified }),
    latestPreviewUrl,
    latestExportUrl,
    preview: latestPreviewArtifact
      ? {
          latestPreviewArtifactId: latestPreviewArtifact.artifactId,
          latestPreviewUrl,
          manifestStorageKey: latestPreviewArtifact.storageKey,
          pageCount: previewPageArtifacts.length,
          pageArtifactIds: previewPageArtifacts.map((item) => item.artifactId),
          items: [
            {
              artifactId: latestPreviewArtifact.artifactId,
              kind: latestPreviewArtifact.kind,
              label: latestPreviewArtifact.label,
              title: latestPreviewArtifact.label ?? latestPreviewArtifact.artifactId,
              storageKey: latestPreviewArtifact.storageKey,
              filename: typeof latestPreviewArtifact.metadata?.filename === 'string' ? latestPreviewArtifact.metadata.filename : undefined,
              mimeType: latestPreviewArtifact.mimeType,
              role: 'bundle',
            },
            ...previewPageArtifacts.map((item) => ({
              artifactId: item.artifactId,
              kind: item.kind,
              label: item.label,
              title: item.label ?? item.artifactId,
              storageKey: item.storageKey,
              filename: typeof item.metadata?.filename === 'string' ? item.metadata.filename : undefined,
              mimeType: item.mimeType,
              pageKey: item.pageKey,
              generationProvenance: item.metadata?.generationProvenance,
              role: 'page' as const,
            })),
          ],
        }
      : undefined,
    export: latestExportArtifact
      ? {
          latestExportArtifactId: latestExportArtifact.artifactId,
          latestExportUrl,
          latestExportLabel: latestExportArtifact.label,
          companionStorageKeys,
          format: 'pptx',
        }
      : undefined,
    delivery: latestExportArtifact
      ? {
          primaryArtifactId: latestExportArtifact.artifactId,
          primaryStorageKey: latestExportArtifact.storageKey,
          primaryLabel: latestExportArtifact.label,
          companionArtifactIds,
          companionStorageKeys,
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
              role: 'primary',
            },
            ...artifacts
              .filter((item) => companionArtifactIds.includes(item.artifactId))
              .map((item) => ({
                artifactId: item.artifactId,
                kind: item.kind,
                label: item.label,
                title: item.label ?? item.artifactId,
                storageKey: item.storageKey,
                filename: typeof item.metadata?.filename === 'string' ? item.metadata.filename : undefined,
                mimeType: item.mimeType,
                role: 'companion' as const,
              })),
          ],
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
          note: latestCheckpoint.note,
          createdAt: latestCheckpoint.createdAt,
        }
      : undefined,
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
          note: lastStartedCheckpoint.note,
          createdAt: lastStartedCheckpoint.createdAt,
        }
      : undefined,
    artifactSummary,
    workbench: {
      timeline,
      currentTimelineItem,
      summaryCards,
      sections: workbenchSections,
      confirmationState: {
        hasRecommendations: recommendations.length > 0,
        hasConfirmationResult: artifacts.some((item) => item.kind === 'confirmation_result'),
      },
      confirmationSubmission: recommendations.length > 0
        ? {
            projectId: project.projectId,
            artifactId: latestConfirmationResultArtifact?.artifactId ?? `${project.projectId}-confirmation-submission`,
            storageKey: latestConfirmationResultArtifact?.storageKey ?? `projects/${project.projectId}/confirmations/result.json`,
            status: confirmationStatus,
            bannerText: confirmationStatus === 'submitted'
              ? `${confirmationCompletedCount}/${recommendations.length} confirmation answers locked and ready for strategist handoff.`
              : confirmationStatus === 'ready'
                ? `${recommendations.length} confirmation answers ready for input.`
                : 'Confirmations are not ready yet.',
            completion: {
              completedCount: confirmationCompletedCount,
              totalCount: recommendations.length,
            },
            questions: confirmationQuestions,
            recommendationCount: recommendations.length,
            questionKeys: recommendations.map((item) => item.key),
            submitAction: confirmationStatus === 'ready' ? confirmationSubmitAction : undefined,
          }
        : undefined,
    },
    sources: artifacts
      .filter((item) => item.kind === 'source_original')
      .map((item) => ({
        sourceId: item.sourceId ?? item.artifactId,
        label: item.label ?? item.artifactId,
        kind: 'text' as const,
        status: 'uploaded' as const,
      })),
    confirmations: recommendations.map((item) => ({
      key: item.key,
      title: item.title,
      recommendation: item.recommendation,
    })),
    artifacts: artifacts.map((item) => ({
      artifactId: item.artifactId,
      kind: item.kind,
      status: item.status,
      label: item.label,
    })),
    lastUpdatedAt: project.updatedAt,
  };
}
