import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { ProductActionResult } from '../adapter/interface';
import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, RevisionRequestRecord, WorkflowCheckpoint } from '../models/projects';
import { runExportFromWorkspace } from '../adapter/export-runtime-bridge';
import { runGenerationFromWorkspace } from '../adapter/generation-runtime-bridge';
import { runSvgAuthoringProbe } from '../adapter/svg-authoring-runtime-bridge';
import { runPreviewFromWorkspace } from '../adapter/preview-runtime-bridge';
import { runQualityCheckFromWorkspace, type QualityCheckRunnerResult } from '../adapter/quality-check-runtime-bridge';

export type StartGenerationResult = ProductActionResult & {
  checkpoints: WorkflowCheckpoint[];
  runId: string;
};

export type RequestRevisionResult = ProductActionResult & {
  checkpoints: WorkflowCheckpoint[];
  revisions: RevisionRequestRecord[];
};

function assertStrategistBridgeVerified(project: ProjectRecord, artifacts: ProductArtifactRef[]): void {
  const strategistRunId = project.lastRunId;
  const requiredArtifacts: Array<{
    kind: 'confirmation_result' | 'design_spec' | 'spec_lock';
    status: ProductArtifactRef['status'];
    storageKey: string;
  }> = [
    {
      kind: 'confirmation_result',
      status: 'ready',
      storageKey: `${project.workspace.workspacePath}/confirmations/result.json`,
    },
    { kind: 'design_spec', status: 'ready', storageKey: `${project.workspace.workspacePath}/design_spec.md` },
    { kind: 'spec_lock', status: 'locked', storageKey: `${project.workspace.workspacePath}/spec_lock.md` },
  ];
  const failures: string[] = [];

  if (!strategistRunId) {
    failures.push('spec_ready project has no strategist run identity');
  }

  for (const required of requiredArtifacts) {
    const matches = artifacts.filter((artifact) => artifact.kind === required.kind);
    if (matches.length !== 1) {
      failures.push(`${required.kind} must have exactly one current artifact; found ${matches.length}`);
      continue;
    }

    const artifact = matches[0];
    if (artifact.projectId !== project.projectId) failures.push(`${required.kind} has a foreign project identity`);
    if (artifact.runId !== strategistRunId) failures.push(`${required.kind} is stale or cross-run`);
    if (artifact.status !== required.status) failures.push(`${required.kind} is ${artifact.status}, not ${required.status}`);
    if (artifact.storageKey !== required.storageKey) failures.push(`${required.kind} has a non-canonical artifact path`);
    if (required.kind === 'confirmation_result' && typeof artifact.metadata?.lockedAt !== 'string') {
      failures.push('confirmation_result is not a locked confirmation result');
    }
    if (
      (required.kind === 'design_spec' || required.kind === 'spec_lock') &&
      artifact.metadata?.verification !== 'materialized_from_locked_confirmations'
    ) {
      failures.push(`${required.kind} lacks runtime strategist verification evidence`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`start_generation requires verified strategist outputs with same-run eligibility: ${failures.join('; ')}`);
  }
}

function toWorkflowCheckpoint(
  project: ProjectRecord,
  stage: WorkflowCheckpoint['stage'],
  statusBefore: ProjectRecord['status'],
  statusAfter: ProjectRecord['status'],
  artifactIds: string[],
  createdAt: string,
  note?: string,
): WorkflowCheckpoint {
  return {
    checkpointId: `${project.projectId}-${stage}-${Date.parse(createdAt)}`,
    projectId: project.projectId,
    stage,
    status: 'completed',
    statusBefore,
    statusAfter,
    artifactIds,
    note,
    createdAt,
  };
}

function attachPhaseCheckpoint(
  project: ProjectRecord,
  checkpoint: WorkflowCheckpoint,
  artifacts: ProductArtifactRef[],
  now: string,
): ProductActionResult {
  return {
    project: {
      ...project,
      latestCheckpointId: checkpoint.checkpointId,
      updatedAt: now,
      lastError: undefined,
    },
    artifacts,
    nextStatus: project.status,
  };
}

export function runStartGeneration(
  project: ProjectRecord,
  artifacts: ProductArtifactRef[] = [],
  now = new Date().toISOString(),
): StartGenerationResult {
  if (project.status !== 'spec_ready') {
    throw new Error(`start_generation requires spec_ready status; received ${project.status}`);
  }

  assertStrategistBridgeVerified(project, artifacts);

  const runId = project.lastRunId ?? `${project.projectId}-run-${Date.parse(now)}`;
  const generationProject: ProjectRecord = {
    ...project,
    status: 'generation_in_progress',
    lastRunId: runId,
    updatedAt: now,
  };
  const generated = runGenerationFromWorkspace(generationProject, now);
  if (generated.runtimeStatus !== 'generation_synced') {
    throw new Error(generated.note);
  }
  const authoringProbe = runSvgAuthoringProbe(generationProject, now);
  if (authoringProbe.runtimeStatus !== 'mutated') {
    throw new Error(`Generation runtime evidence passed, but SVG authoring probe failed: ${authoringProbe.note}`);
  }
  const refreshedGeneration = runGenerationFromWorkspace(generationProject, now);
  if (refreshedGeneration.runtimeStatus !== 'generation_synced') {
    throw new Error(`SVG authoring probe mutated the workspace, but refreshed generation evidence failed: ${refreshedGeneration.note}`);
  }

  const generationArtifacts = [
    ...generated.artifacts,
    ...authoringProbe.artifacts,
    ...refreshedGeneration.artifacts.map((artifact) => ({
      ...artifact,
      artifactId: `${artifact.artifactId}-refreshed`,
      label: `${artifact.label ?? 'Generation runtime evidence manifest'} (refreshed after authoring probe)`,
      metadata: {
        ...artifact.metadata,
        verification: 'runtime_workspace_generation_bridge_refreshed_after_authoring',
        refreshedAfterAuthoringProbe: true,
      },
    })),
  ];

  const startCheckpoint = toWorkflowCheckpoint(
    generationProject,
    'generation_started',
    project.status,
    'generation_in_progress',
    generationArtifacts.map((artifact) => artifact.artifactId),
    now,
    'Generation phase entered via runtime workspace evidence plus live SVG authoring mutation probe.',
  );
  const attached = attachPhaseCheckpoint(generationProject, startCheckpoint, generationArtifacts, now);

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    nextStatus: generationProject.status,
    checkpoints: [startCheckpoint],
    runId,
  };
}

export function runResumeGeneration(
  project: ProjectRecord,
  now = new Date().toISOString(),
): StartGenerationResult {
  if (project.status !== 'revision_requested' || !project.latestRevisionRequestId) {
    throw new Error(
      `resume_generation requires revision_requested status with a revision record; received ${project.status} and ${project.latestRevisionRequestId}.`,
    );
  }

  const runId = project.lastRunId ?? `${project.projectId}-run-${Date.parse(now)}`;
  const resumedProject: ProjectRecord = {
    ...project,
    status: 'generation_in_progress',
    lastRunId: runId,
    updatedAt: now,
  };
  const generated = runGenerationFromWorkspace(resumedProject, now);
  if (generated.runtimeStatus !== 'generation_synced') {
    throw new Error(generated.note);
  }
  const authoringProbe = runSvgAuthoringProbe(resumedProject, now);
  if (authoringProbe.runtimeStatus !== 'mutated') {
    throw new Error(`Generation resume evidence passed, but SVG authoring probe failed: ${authoringProbe.note}`);
  }
  const refreshedGeneration = runGenerationFromWorkspace(resumedProject, now);
  if (refreshedGeneration.runtimeStatus !== 'generation_synced') {
    throw new Error(`SVG authoring probe mutated the workspace during resume, but refreshed generation evidence failed: ${refreshedGeneration.note}`);
  }

  const generationArtifacts = [
    ...generated.artifacts,
    ...authoringProbe.artifacts,
    ...refreshedGeneration.artifacts.map((artifact) => ({
      ...artifact,
      artifactId: `${artifact.artifactId}-refreshed`,
      label: `${artifact.label ?? 'Generation runtime evidence manifest'} (refreshed after authoring probe)`,
      metadata: {
        ...artifact.metadata,
        verification: 'runtime_workspace_generation_bridge_refreshed_after_authoring',
        refreshedAfterAuthoringProbe: true,
      },
    })),
  ];

  const resumeCheckpoint = toWorkflowCheckpoint(
    resumedProject,
    'generation_resumed',
    project.status,
    'generation_in_progress',
    [...generationArtifacts.map((artifact) => artifact.artifactId), ...(project.latestRevisionRequestId ? [project.latestRevisionRequestId] : [])],
    now,
    'Generation resumed after revision request via runtime workspace evidence plus live SVG authoring mutation probe.',
  );
  const attached = attachPhaseCheckpoint(resumedProject, resumeCheckpoint, generationArtifacts, now);

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    nextStatus: resumedProject.status,
    checkpoints: [resumeCheckpoint],
    runId,
  };
}

export function syncPreviewArtifacts(
  project: ProjectRecord,
  now = new Date().toISOString(),
): ProductActionResult & {
  checkpoints: WorkflowCheckpoint[];
  artifacts: ProductArtifactRef[];
} {
  if (project.status !== 'generation_in_progress') {
    throw new Error(`preview sync requires generation_in_progress status; received ${project.status}`);
  }

  const runId = project.lastRunId ?? `${project.projectId}-run-${Date.parse(now)}`;
  const generationProject: ProjectRecord = {
    ...project,
    lastRunId: runId,
    updatedAt: now,
  };

  const normalizedGeneration = runGenerationFromWorkspace(generationProject, now);
  if (normalizedGeneration.runtimeStatus !== 'generation_synced') {
    throw new Error(`preview sync normalization failed: ${normalizedGeneration.note}`);
  }

  const authoringProbe = runSvgAuthoringProbe(generationProject, now);
  if (authoringProbe.runtimeStatus !== 'mutated') {
    throw new Error(`Preview sync generation evidence passed, but SVG authoring probe failed: ${authoringProbe.note}`);
  }

  const refreshedGeneration = runGenerationFromWorkspace(generationProject, now);
  if (refreshedGeneration.runtimeStatus !== 'generation_synced') {
    throw new Error(`Preview sync SVG authoring probe mutated the workspace, but refreshed generation evidence failed: ${refreshedGeneration.note}`);
  }

  const previewed = runPreviewFromWorkspace(generationProject, now);
  if (previewed.runtimeStatus !== 'preview_synced') {
    throw new Error(previewed.note);
  }

  const nextProject: ProjectRecord = {
    ...generationProject,
    status: 'preview_available',
    updatedAt: now,
  };
  const previewCheckpoint = toWorkflowCheckpoint(
    nextProject,
    'preview_synced',
    project.status,
    nextProject.status,
    previewed.artifacts.map((item) => item.artifactId),
    now,
    'Preview artifacts synced only after live SVG authoring mutation and refreshed runtime generation evidence were handed off to the product-facing workbench.',
  );
  const refreshedGenerationArtifacts = refreshedGeneration.artifacts.map((artifact) => ({
    ...artifact,
    artifactId: `${artifact.artifactId}-refreshed-after-preview-authoring`,
    label: `${artifact.label ?? 'Generation runtime evidence manifest'} (refreshed after preview authoring probe)`,
    metadata: {
      ...artifact.metadata,
      verification: 'runtime_workspace_generation_bridge_refreshed_after_authoring',
      refreshedAfterAuthoringProbe: true,
    },
  }));
  const attached = attachPhaseCheckpoint(
    nextProject,
    previewCheckpoint,
    [...normalizedGeneration.artifacts, ...authoringProbe.artifacts, ...refreshedGenerationArtifacts, ...previewed.artifacts],
    now,
  );

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    nextStatus: nextProject.status,
    checkpoints: [previewCheckpoint],
  };
}

export function requestRevision(
  project: ProjectRecord,
  note: string,
  now = new Date().toISOString(),
): RequestRevisionResult {
  if (project.status !== 'preview_available') {
    throw new Error(`request_revision requires preview_available status; received ${project.status}`);
  }

  const revisionId = `${project.projectId}-revision-${Date.parse(now)}`;
  const revision: RevisionRequestRecord = {
    revisionId,
    projectId: project.projectId,
    note,
    status: 'requested',
    requestedAt: now,
    sourceStatus: 'preview_available',
    targetStatus: 'revision_requested',
  };
  const nextProject: ProjectRecord = {
    ...project,
    status: 'revision_requested',
    latestRevisionRequestId: revisionId,
    updatedAt: now,
  };
  const revisionArtifact: ProductArtifactRef = {
    artifactId: revisionId,
    projectId: project.projectId,
    kind: 'runtime_log',
    scope: 'run',
    status: 'ready',
    label: 'revision request',
    runId: project.lastRunId,
    storageKey: `${project.workspace.workspacePath}/runs/${project.lastRunId ?? 'pending'}/revision-request.txt`,
    mimeType: 'text/plain',
    metadata: {
      note,
      requestedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
  const revisionCheckpoint = toWorkflowCheckpoint(
    nextProject,
    'revision_requested',
    project.status,
    nextProject.status,
    [revisionArtifact.artifactId],
    now,
    'Revision requested from preview stage.',
  );
  revision.checkpointId = revisionCheckpoint.checkpointId;
  const attached = attachPhaseCheckpoint(nextProject, revisionCheckpoint, [revisionArtifact], now);

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    nextStatus: nextProject.status,
    checkpoints: [revisionCheckpoint],
    revisions: [revision],
  };
}

export function runQualityCheckPhase(
  project: ProjectRecord,
  artifacts: ProductArtifactRef[],
  checkpoints: WorkflowCheckpoint[],
  now = new Date().toISOString(),
  options: { run?: (input: { project: ProjectRecord; sourcePreviewCheckpointId: string; bundle: ProductArtifactRef; pages: ProductArtifactRef[] }) => QualityCheckRunnerResult } = {},
): ProductActionResult & { checkpoints: WorkflowCheckpoint[]; artifacts: ProductArtifactRef[] } {
  const fail = (note: string) => {
    const checkpoint: WorkflowCheckpoint = {
      checkpointId: `${project.projectId}-quality_checked-${Date.parse(now)}`,
      projectId: project.projectId,
      stage: 'quality_checked',
      status: 'failed',
      statusBefore: project.status,
      statusAfter: project.status,
      artifactIds: [],
      note,
      createdAt: now,
    };
    return {
      project: { ...project, latestCheckpointId: checkpoint.checkpointId, lastError: note, updatedAt: now },
      artifacts: [],
      nextStatus: project.status,
      checkpoints: [checkpoint],
    };
  };

  if (project.status !== 'preview_available') return fail(`quality check requires preview_available status; received ${project.status}`);
  if (!project.lastRunId) return fail('quality check requires a current run identity');

  const ready = artifacts.filter((artifact) => artifact.status === 'ready' && artifact.runId === project.lastRunId);
  const byId = new Map<string, ProductArtifactRef[]>();
  for (const artifact of ready) byId.set(artifact.artifactId, [...(byId.get(artifact.artifactId) ?? []), artifact]);
  const previewCheckpoints = checkpoints
    .filter((checkpoint) => checkpoint.projectId === project.projectId && checkpoint.stage === 'preview_synced' && checkpoint.status === 'completed')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  if (previewCheckpoints.length !== 1) return fail('quality check requires exactly one completed current-project preview checkpoint');
  const previewCheckpoint = previewCheckpoints[0]!;
  if (new Set(previewCheckpoint.artifactIds).size !== previewCheckpoint.artifactIds.length) return fail('quality check preview checkpoint has duplicate artifact identities');
  const selected: ProductArtifactRef[] = [];
  for (const artifactId of previewCheckpoint.artifactIds) {
    const matches = byId.get(artifactId) ?? [];
    if (matches.length !== 1) return fail(`quality check preview artifact ${artifactId} is missing, stale, or ambiguous`);
    selected.push(matches[0]!);
  }
  const bundles = selected.filter((artifact) => artifact.kind === 'preview_bundle');
  const pages = selected.filter((artifact) => artifact.kind === 'preview_page_svg');
  if (bundles.length !== 1 || pages.length === 0) return fail('quality check requires one preview bundle and at least one preview page');
  const pageKeys = pages.map((page) => page.pageKey);
  if (pageKeys.some((pageKey) => !pageKey) || new Set(pageKeys).size !== pageKeys.length) return fail('quality check preview pages require distinct page keys');
  const workspace = path.resolve(project.workspace.workspacePath);
  for (const page of pages) {
    const pagePath = path.resolve(page.storageKey);
    const provenance = page.metadata?.generationProvenance as { sha256?: unknown } | undefined;
    if (!pagePath.startsWith(`${workspace}${path.sep}`) || !pagePath.includes(`${path.sep}svg_output${path.sep}`) || !existsSync(pagePath)) {
      return fail(`quality check preview page ${page.artifactId} has an invalid workspace path`);
    }
    if (typeof provenance?.sha256 !== 'string' || createHash('sha256').update(readFileSync(pagePath)).digest('hex') !== provenance.sha256) {
      return fail(`quality check preview page ${page.artifactId} has missing or mismatched generation provenance`);
    }
  }

  const runtime = runQualityCheckFromWorkspace(
    { project, sourcePreviewCheckpointId: previewCheckpoint.checkpointId, bundle: bundles[0]!, pages },
    now,
    options.run ? (input) => options.run!(input) : undefined,
  );
  const checkpoint = toWorkflowCheckpoint(
    project,
    'quality_checked',
    project.status,
    project.status,
    [runtime.artifact.artifactId],
    now,
    runtime.note,
  );
  if (!runtime.passed) {
    return {
      project: { ...project, latestCheckpointId: checkpoint.checkpointId, lastError: runtime.note, updatedAt: now },
      artifacts: [runtime.artifact],
      nextStatus: project.status,
      checkpoints: [{ ...checkpoint, status: 'failed' }],
    };
  }
  const attached = attachPhaseCheckpoint(project, checkpoint, [runtime.artifact], now);
  return { ...attached, checkpoints: [checkpoint], artifacts: [runtime.artifact] };
}

export function exportLocalPhase(
  project: ProjectRecord,
  now = new Date().toISOString(),
): ProductActionResult & {
  checkpoints: WorkflowCheckpoint[];
  artifacts: ProductArtifactRef[];
} {
  if (project.status !== 'preview_available') {
    throw new Error(`export phase requires preview_available status; received ${project.status}`);
  }

  const normalizedGeneration = runGenerationFromWorkspace(project, now);
  if (normalizedGeneration.runtimeStatus !== 'generation_synced') {
    throw new Error(`export normalization failed: ${normalizedGeneration.note}`);
  }

  const exported = runExportFromWorkspace(project, now);
  if (exported.runtimeStatus !== 'exported') {
    throw new Error(exported.note);
  }

  const nextProject: ProjectRecord = {
    ...project,
    status: 'export_ready',
    updatedAt: now,
  };
  const exportCheckpoint = toWorkflowCheckpoint(
    nextProject,
    'export_ready',
    project.status,
    nextProject.status,
    exported.artifacts.map((artifact) => artifact.artifactId),
    now,
    'Export artifacts prepared by the runtime export bridge.',
  );
  const attached = attachPhaseCheckpoint(nextProject, exportCheckpoint, [...normalizedGeneration.artifacts, ...exported.artifacts], now);

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    nextStatus: nextProject.status,
    checkpoints: [exportCheckpoint],
  };
}
