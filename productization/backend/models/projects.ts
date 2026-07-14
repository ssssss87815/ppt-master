import type { ProductWorkspaceBinding } from '../adapter/workspace';
import type { ProductArtifactRef } from './artifacts';
import type { ProjectStatus } from '../state/schema';

export type RevisionRequestRecord = {
  revisionId: string;
  projectId: string;
  note: string;
  status: 'requested';
  requestedAt: string;
  sourceStatus: Extract<ProjectStatus, 'preview_available'>;
  targetStatus: Extract<ProjectStatus, 'revision_requested'>;
  checkpointId?: string;
};

export type ProjectRecord = {
  projectId: string;
  name: string;
  status: ProjectStatus;
  workspace: ProductWorkspaceBinding;
  latestCheckpointId?: string;
  lastRunId?: string;
  lastError?: string;
  latestRevisionRequestId?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowCheckpointStage =
  | 'project_created'
  | 'sources_imported'
  | 'confirmations_prepared'
  | 'confirmations_locked'
  | 'strategist_artifacts_synced'
  | 'generation_started'
  | 'generation_resumed'
  | 'preview_synced'
  | 'quality_checked'
  | 'post_processed'
  | 'revision_requested'
  | 'export_ready';

export type WorkflowCheckpointStatus = 'started' | 'completed' | 'failed';

export type WorkflowCheckpoint = {
  checkpointId: string;
  projectId: string;
  stage: WorkflowCheckpointStage;
  status: WorkflowCheckpointStatus;
  statusBefore: ProjectStatus;
  statusAfter: ProjectStatus;
  artifactIds: string[];
  note?: string;
  createdAt: string;
};

export type Slice1ProjectSnapshot = {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  checkpoints: WorkflowCheckpoint[];
};
