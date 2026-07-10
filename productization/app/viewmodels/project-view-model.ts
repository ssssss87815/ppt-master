import type { ProductArtifactRef } from '../../backend/models/artifacts';
import type { ExportViewModel } from './export-view-model';
import type { PreviewViewModel } from './preview-view-model';
import type { ProjectStatus } from '../../backend/state/schema';
import type { ConfirmationSubmissionViewModel } from './confirmation-submission-view-model';

export type ProjectTimelineItemViewModel = {
  key: 'sources' | 'confirmations' | 'strategist' | 'preview' | 'export';
  status: ProjectStatus;
  title: string;
  description?: string;
  reached: boolean;
  isCurrent: boolean;
  isNext: boolean;
};

export type ProjectWorkbenchSectionStatus = 'ready' | 'current' | 'upcoming' | 'complete' | 'warning';

export type ProjectWorkbenchSectionViewModel = {
  key: 'timeline' | 'sources' | 'confirmations' | 'checkpoint' | 'preview' | 'export' | 'strategist' | 'recovery';
  title: string;
  status: ProjectWorkbenchSectionStatus;
  summary: string;
  action?: ProjectViewModel['nextActions'][number];
  description?: string;
  badges?: Array<{
    tone: 'neutral' | 'active' | 'success' | 'warning';
    text: string;
  }>;
};

export type StrategistVerificationArtifactViewModel = {
  artifactId: string;
  kind: 'design_spec' | 'spec_lock';
  label?: string;
  status: 'planned' | 'pending' | 'ready' | 'locked' | 'superseded' | 'failed';
  verificationState: 'verified' | 'pending_runtime_verification';
  storageKey?: string;
};

export type StrategistHandoffViewModel = {
  gateStatus: 'verified' | 'pending_runtime_verification';
  summary: string;
  detail: string;
  panelStatus: ProjectWorkbenchSectionStatus;
  verificationBadgeTone: 'success' | 'warning';
  verificationBadgeText: string;
  gateLabel: string;
  verifiedArtifactCount: number;
  pendingArtifactCount: number;
  generationGateCopy: string;
  artifacts: StrategistVerificationArtifactViewModel[];
};

export type SourceItemViewModel = {
  sourceId: string;
  label: string;
  kind: 'file' | 'url' | 'text';
  status: 'uploaded' | 'normalized' | 'failed';
};

export type ConfirmationQuestionViewModel = {
  key: string;
  title: string;
  recommendation?: string;
  answer?: unknown;
};

export type ProjectViewModel = {
  projectId: string;
  name: string;
  status: ProjectStatus;
  workspacePath?: string;
  title?: string;
  description?: string;
  currentPhase: {
    status: ProjectStatus;
    title: string;
    description?: string;
  };
  timeline: ProjectTimelineItemViewModel[];
  nextActions: Array<
    | 'create_project'
    | 'import_sources'
    | 'prepare_confirmations'
    | 'submit_confirmations'
    | 'start_generation'
    | 'resume_generation'
    | 'request_revision'
    | 'export_pptx'
  >;
  latestPreviewUrl?: string;
  latestExportUrl?: string;
  preview?: PreviewViewModel;
  export?: ExportViewModel;
  latestRevisionRequest?: {
    revisionId: string;
    note: string;
    status: 'requested';
    requestedAt: string;
    sourceStatus: Extract<ProjectStatus, 'preview_available'>;
    targetStatus: Extract<ProjectStatus, 'revision_requested'>;
    checkpointId?: string;
  };
  lastStartedCheckpoint?: {
    checkpointId: string;
    storageKey: string;
    stage?: string;
    stageTitle?: string;
    status?: string;
    statusTitle?: string;
    title?: string;
    artifactIds?: string[];
    createdAt: string;
    note?: string;
  };
  delivery?: {
    primaryArtifactId?: string;
    primaryStorageKey?: string;
    primaryLabel?: string;
    companionArtifactIds?: string[];
    companionStorageKeys?: string[];
    assetDirectoryStorageKey?: string;
    runId?: string;
    items?: Array<{
      artifactId: string;
      kind: ProductArtifactRef['kind'];
      label?: string;
      title?: string;
      storageKey: string;
      filename?: string;
      mimeType?: string;
      role: 'primary' | 'companion';
    }>;
  };
  latestCheckpoint?: {
    checkpointId: string;
    storageKey: string;
    stage?: string;
    stageTitle?: string;
    status?: string;
    statusTitle?: string;
    title?: string;
    artifactIds?: string[];
    createdAt: string;
    note?: string;
  };
  artifactSummary?: {
    total: number;
    planned: number;
    pending: number;
    ready: number;
    locked: number;
    superseded: number;
    failed: number;
    byKind: Partial<Record<ProductArtifactRef['kind'], number>>;
  };
  workbench: {
    timeline?: ProjectTimelineItemViewModel[];
    currentTimelineItem?: ProjectTimelineItemViewModel;
    strategistHandoff?: StrategistHandoffViewModel;
    sections: ProjectWorkbenchSectionViewModel[];
    confirmationState: {
      hasRecommendations?: boolean;
      hasConfirmationResult?: boolean;
      recommendationCount: number;
      answeredCount: number;
      locked: boolean;
      displayStatus: 'not_ready' | 'ready_for_review' | 'locked' | 'completed';
    };
    confirmationSubmission?: ConfirmationSubmissionViewModel;
    summaryCards: Array<{
      key: 'sources' | 'confirmations' | 'preview' | 'export' | 'artifacts' | 'strategist';
      title: string;
      value: string;
      tone: 'neutral' | 'active' | 'success' | 'warning';
    }>;
  };
  lastError?: string;
  lastRunId?: string;
  sources: SourceItemViewModel[];
  confirmations: ConfirmationQuestionViewModel[];
  artifacts: Array<Pick<ProductArtifactRef, 'artifactId' | 'kind' | 'status' | 'label'>>;
  lastUpdatedAt: string;
};
