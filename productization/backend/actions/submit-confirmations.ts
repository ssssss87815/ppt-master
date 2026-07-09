import { runStrategistFromLockedConfirmations } from '../adapter/strategist-runtime-bridge';
import { attachCheckpoint } from '../adapter/pptmaster-adapter';
import type { ProductArtifactRef } from '../models/artifacts';
import type { SubmitConfirmationsAction } from '../models/actions';
import type { SubmitConfirmationsPayload } from '../models/confirmations';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';
import { assertProjectStatus } from '../state/status-guards';

export type SubmitConfirmationsResult = {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  checkpoint: WorkflowCheckpoint;
};

export function applySubmitConfirmations(
  project: ProjectRecord,
  action: SubmitConfirmationsAction,
  createdAt: string,
): SubmitConfirmationsResult {
  assertProjectStatus(project.status, 'confirmation_pending', 'submitConfirmations');

  const strategistPayload: SubmitConfirmationsPayload = {
    answers: action.payload.answers as SubmitConfirmationsPayload['answers'],
    lockedAt: createdAt,
  };

  const resultArtifact: ProductArtifactRef = {
    artifactId: `${project.projectId}-confirmations-result`,
    projectId: project.projectId,
    kind: 'confirmation_result',
    scope: 'project',
    label: 'Locked confirmations result',
    status: 'ready',
    storageKey: `projects/${project.projectId}/confirmations/result.json`,
    metadata: {
      answers: action.payload.answers,
      lockedAt: createdAt,
      confirmationSetId: action.payload.confirmationSetId,
    },
    createdAt,
    updatedAt: createdAt,
  };

  const checkpointBase: WorkflowCheckpoint = {
    checkpointId: `${project.projectId}-confirmations-locked`,
    projectId: project.projectId,
    stage: 'confirmations_locked',
    status: 'completed',
    statusBefore: project.status,
    statusAfter: 'confirmation_locked',
    artifactIds: [resultArtifact.artifactId],
    createdAt,
  };

  const lockedProject: ProjectRecord = {
    ...project,
    status: 'confirmation_locked',
    updatedAt: createdAt,
  };

  const strategist = runStrategistFromLockedConfirmations({
    project: lockedProject,
    payload: strategistPayload,
    now: createdAt,
  });

  const checkpoint: WorkflowCheckpoint = {
    ...checkpointBase,
    artifactIds: [resultArtifact.artifactId, ...strategist.artifacts.map((item) => item.artifactId)],
    statusAfter: strategist.artifacts.some((item) => item.kind === 'spec_lock' && item.status === 'ready')
      ? 'spec_ready'
      : 'confirmation_locked',
  };

  const nextProject: ProjectRecord = {
    ...lockedProject,
    status: checkpoint.statusAfter,
    updatedAt: createdAt,
  };

  const artifacts = [resultArtifact, ...strategist.artifacts];
  const attached = attachCheckpoint(nextProject, checkpoint, artifacts, createdAt);

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    checkpoint,
  };
}
