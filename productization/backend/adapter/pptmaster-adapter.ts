import type { ProductArtifactRef } from '../models/artifacts';
import type { ConfirmationRecommendation, SubmitConfirmationsPayload } from '../models/confirmations';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';

export type ImportSourcesStubParams = {
  project: ProjectRecord;
  sources: Array<{
    kind: 'file' | 'url' | 'text';
    value: string;
    label?: string;
  }>;
  now?: string;
};

export type PrepareConfirmationsStubParams = {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  now?: string;
};

export type SubmitConfirmationsStubParams = {
  project: ProjectRecord;
  payload: SubmitConfirmationsPayload;
  now?: string;
};

export function createWorkflowCheckpointArtifact(
  project: ProjectRecord,
  checkpoint: WorkflowCheckpoint,
  now = checkpoint.createdAt,
): ProductArtifactRef {
  return {
    artifactId: checkpoint.checkpointId,
    projectId: project.projectId,
    kind: 'workflow_checkpoint',
    scope: 'project',
    status: 'ready',
    label: `${checkpoint.stage} checkpoint`,
    storageKey: `${project.workspace.workspacePath}/checkpoints/${checkpoint.checkpointId}.json`,
    mimeType: 'application/json',
    createdAt: now,
    updatedAt: now,
  };
}

export function attachCheckpoint(
  project: ProjectRecord,
  checkpoint: WorkflowCheckpoint,
  artifacts: ProductArtifactRef[],
  now = checkpoint.createdAt,
): {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
} {
  return {
    project: {
      ...project,
      latestCheckpointId: checkpoint.checkpointId,
      updatedAt: now,
    },
    artifacts: [...artifacts, createWorkflowCheckpointArtifact(project, checkpoint, now)],
  };
}

export function stubImportSourceArtifacts({
  project,
  sources,
  now = new Date().toISOString(),
}: ImportSourcesStubParams): ProductArtifactRef[] {
  return sources.flatMap((source, index) => {
    const base = `${project.projectId}-source-${index + 1}`;
    const label = source.label ?? `${source.kind}:${index + 1}`;

    return [
      {
        artifactId: `${base}-original`,
        projectId: project.projectId,
        kind: 'source_original',
        scope: 'source',
        status: 'ready',
        label,
        sourceId: base,
        storageKey: `${project.workspace.workspacePath}/sources/${base}/original.txt`,
        mimeType: 'text/plain',
        createdAt: now,
        updatedAt: now,
      },
      {
        artifactId: `${base}-normalized`,
        projectId: project.projectId,
        kind: 'source_normalized',
        scope: 'source',
        status: 'ready',
        label,
        sourceId: base,
        storageKey: `${project.workspace.workspacePath}/sources/${base}/normalized.json`,
        mimeType: 'application/json',
        createdAt: now,
        updatedAt: now,
      },
    ];
  });
}

export function stubPrepareConfirmationRecommendations({
  project,
  artifacts,
  now = new Date().toISOString(),
}: PrepareConfirmationsStubParams): {
  artifact: ProductArtifactRef;
  recommendations: ConfirmationRecommendation[];
} {
  const sourceCount = artifacts.filter((item) => item.kind === 'source_original').length;

  return {
    artifact: {
      artifactId: `${project.projectId}-confirmation-recommendations`,
      projectId: project.projectId,
      kind: 'confirmation_recommendations',
      scope: 'project',
      status: 'ready',
      label: 'Eight Confirmations recommendations',
      storageKey: `${project.workspace.workspacePath}/confirmations/recommendations.json`,
      mimeType: 'application/json',
      createdAt: now,
      updatedAt: now,
    },
    recommendations: [
      { key: 'audience', title: 'Audience', recommendation: `Use a founder-facing framing based on ${sourceCount} imported source(s).` },
      { key: 'goal', title: 'Goal', recommendation: 'Clarify the single most important outcome for this deck.' },
      { key: 'tone', title: 'Tone', recommendation: 'Default to crisp, investor-ready language.' },
      { key: 'language', title: 'Language', recommendation: 'Pick the primary language the live presentation will use.' },
      { key: 'brand', title: 'Brand', recommendation: 'Name the canonical product / company identity to keep terminology stable.' },
      { key: 'outline', title: 'Outline', recommendation: 'Use a simple story spine: problem, solution, proof, ask.' },
      { key: 'visual_style', title: 'Visual Style', recommendation: 'Choose one visual direction instead of mixing styles.' },
      { key: 'delivery', title: 'Delivery', recommendation: 'State whether this is for live pitch, async send, or internal review.' },
    ],
  };
}

export function stubWriteConfirmationResult({
  project,
  payload,
  now = new Date().toISOString(),
}: SubmitConfirmationsStubParams): ProductArtifactRef[] {
  const lockedAt = payload.lockedAt ?? now;

  return [
    {
      artifactId: `${project.projectId}-confirmation-result`,
      projectId: project.projectId,
      kind: 'confirmation_result',
      scope: 'project',
      status: 'locked',
      label: 'Locked Eight Confirmations',
      storageKey: `${project.workspace.workspacePath}/confirmations/result.json`,
      mimeType: 'application/json',
      metadata: {
        answers: payload.answers,
        lockedAt,
      },
      createdAt: lockedAt,
      updatedAt: lockedAt,
    },
    {
      artifactId: `${project.projectId}-design-spec`,
      projectId: project.projectId,
      kind: 'design_spec',
      scope: 'project',
      status: 'pending',
      label: 'Strategist design specification (unverified)',
      storageKey: `${project.workspace.workspacePath}/design_spec.md`,
      mimeType: 'text/markdown',
      metadata: {
        role: 'strategist_output',
        verification: 'unverified_runtime_bridge',
        source: 'productization_stub_expectation',
      },
      createdAt: lockedAt,
      updatedAt: lockedAt,
    },
    {
      artifactId: `${project.projectId}-spec-lock`,
      projectId: project.projectId,
      kind: 'spec_lock',
      scope: 'project',
      status: 'pending',
      label: 'Executor entry spec lock (unverified)',
      storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
      mimeType: 'text/markdown',
      metadata: {
        role: 'strategist_output',
        verification: 'unverified_runtime_bridge',
        source: 'productization_stub_expectation',
      },
      createdAt: lockedAt,
      updatedAt: lockedAt,
    },
  ];
}

export function toWorkflowCheckpoint(
  project: ProjectRecord,
  stage: WorkflowCheckpoint['stage'],
  statusBefore: ProjectRecord['status'],
  statusAfter: ProjectRecord['status'],
  artifactIds: string[],
  now = new Date().toISOString(),
): WorkflowCheckpoint {
  return {
    checkpointId: `${project.projectId}-${stage}-${Date.parse(now)}`,
    projectId: project.projectId,
    stage,
    status: 'completed',
    statusBefore,
    statusAfter,
    artifactIds,
    createdAt: now,
  };
}
