import type { PrepareConfirmationsAction } from '../models/actions';
import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';
import { attachCheckpoint } from '../adapter/pptmaster-adapter';
import { assertProjectStatus } from '../state/status-guards';

export type ConfirmationRecommendation = {
  key: string;
  title: string;
  recommendation: string;
};

export function applyBaseRecommendations(action: PrepareConfirmationsAction['payload']): ConfirmationRecommendation[] {
  return [
    {
      key: 'audience',
      title: 'Audience',
      recommendation: `Clarify the target audience for project ${action.projectId}.`,
    },
    {
      key: 'goal',
      title: 'Goal',
      recommendation: 'Define the primary outcome this deck should achieve.',
    },
    {
      key: 'tone',
      title: 'Tone',
      recommendation: 'Choose the tone that best fits the intended audience and setting.',
    },
    {
      key: 'language',
      title: 'Language',
      recommendation: 'Confirm the presentation language before generation starts.',
    },
    {
      key: 'brand',
      title: 'Brand',
      recommendation: 'Specify brand constraints, identity, or reference materials to apply.',
    },
    {
      key: 'outline',
      title: 'Outline',
      recommendation: 'Lock the narrative arc and slide ordering before generation.',
    },
    {
      key: 'visual_style',
      title: 'Visual style',
      recommendation: 'Choose the visual style direction for layouts, typography, and imagery.',
    },
    {
      key: 'delivery',
      title: 'Delivery context',
      recommendation: 'State how this deck will be delivered so pacing and density can match.',
    },
  ];
}

export type PrepareConfirmationsResult = {
  project: ProjectRecord;
  artifact: ProductArtifactRef;
  recommendations: ConfirmationRecommendation[];
  checkpoint: WorkflowCheckpoint;
};

export function applyPrepareConfirmations(
  project: ProjectRecord,
  artifacts: ProductArtifactRef[],
  action: PrepareConfirmationsAction,
  createdAt: string,
): PrepareConfirmationsResult {
  assertProjectStatus(project.status, 'sources_ready', 'prepareConfirmations');

  const recommendations = applyBaseRecommendations(action.payload);
  const artifactId = `${project.projectId}-recommendations`;
  const artifact: ProductArtifactRef = {
    artifactId,
    projectId: project.projectId,
    kind: 'confirmation_recommendations',
    scope: 'project',
    label: 'Eight confirmations recommendations',
    status: 'ready',
    storageKey: `projects/${project.projectId}/confirmations/recommendations.json`,
    metadata: { recommendationCount: recommendations.length },
    createdAt,
    updatedAt: createdAt,
  };

  const nextProject: ProjectRecord = {
    ...project,
    status: 'confirmation_pending',
    updatedAt: createdAt,
  };

  const checkpoint: WorkflowCheckpoint = {
    checkpointId: `${project.projectId}-confirmations-prepared`,
    projectId: project.projectId,
    stage: 'confirmations_prepared',
    status: 'completed',
    statusBefore: project.status,
    statusAfter: nextProject.status,
    artifactIds: [artifactId],
    createdAt,
  };

  const attached = attachCheckpoint(nextProject, checkpoint, [artifact], createdAt);

  return {
    project: attached.project,
    artifact,
    recommendations,
    checkpoint,
  };
}
