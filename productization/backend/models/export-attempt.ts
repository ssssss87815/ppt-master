export type ExportAttemptStatus =
  | 'reserved'
  | 'running'
  | 'committing'
  | 'completed'
  | 'failed_recoverable'
  | 'failed_terminal'
  | 'superseded';

export type ExportAttempt = {
  id: string;
  projectId: string;
  exportKey: string;
  idempotencyKey: string;
  format: 'pptx';
  runId: string;
  previewCheckpointId: string;
  previewArtifactIds: string[];
  previewArtifactDigest: string;
  status: ExportAttemptStatus;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attemptNumber: number;
  stagedOutputRef?: string;
  committedArtifactIds: string[];
  committedCheckpointId?: string;
  errorClass?: 'runtime_recoverable' | 'persistence_recoverable' | 'integrity_terminal';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExportDelivery = {
  attemptId: string;
  projectId: string;
  exportKey: string;
  artifactIds: string[];
  primaryArtifactId: string;
  checkpointId: string;
};

export type ExportRejection =
  | 'project_not_preview_available'
  | 'project_run_mismatch'
  | 'missing_or_invalid_attempt'
  | 'commit_invariant_violation';
