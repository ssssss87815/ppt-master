import {
  exportLocalPhase,
  requestRevision,
  runResumeGeneration,
  runStartGeneration,
  syncPreviewArtifacts,
} from './phase-runner';
import { dispatchProductAction } from './dispatch';
import type { PptmasterRuntimeAdapter } from '../adapter/interface';
import type { ProductAction } from '../models/actions';
import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, RevisionRequestRecord, WorkflowCheckpoint } from '../models/projects';

function requireProject(actionType: ProductAction['type'], project?: ProjectRecord): ProjectRecord {
  if (!project) {
    throw new Error(`${actionType} requires project context`);
  }
  return project;
}

function assertProjectStatus(
  actionType: ProductAction['type'],
  project: ProjectRecord,
  expected: ProjectRecord['status'],
): void {
  if (project.status !== expected) {
    throw new Error(`${actionType} requires project status ${expected}; received ${project.status}`);
  }
}

export async function runWorkflowAction(
  adapter: PptmasterRuntimeAdapter,
  action: ProductAction,
  project?: ProjectRecord,
) {
  switch (action.type) {
    case 'create_project':
      if (project) {
        throw new Error('create_project does not accept an existing project context');
      }
      return dispatchProductAction(adapter, action);
    case 'import_sources':
      assertProjectStatus(action.type, requireProject(action.type, project), 'draft');
      return dispatchProductAction(adapter, action);
    case 'prepare_confirmations':
      assertProjectStatus(action.type, requireProject(action.type, project), 'sources_ready');
      return dispatchProductAction(adapter, action);
    case 'submit_confirmations':
      assertProjectStatus(action.type, requireProject(action.type, project), 'confirmation_pending');
      return dispatchProductAction(adapter, action);
    case 'start_generation':
      assertProjectStatus(action.type, requireProject(action.type, project), 'spec_ready');
      return dispatchProductAction(adapter, action);
    case 'resume_generation':
      assertProjectStatus(action.type, requireProject(action.type, project), 'revision_requested');
      return dispatchProductAction(adapter, action);
    case 'request_revision':
      assertProjectStatus(action.type, requireProject(action.type, project), 'preview_available');
      return dispatchProductAction(adapter, action);
    case 'export_pptx':
      assertProjectStatus(action.type, requireProject(action.type, project), 'preview_available');
      return dispatchProductAction(adapter, action);
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function runLocalGenerationPhase(
  project: ProjectRecord,
  now = new Date().toISOString(),
  artifacts: ProductArtifactRef[] = [],
): {
  started: {
    project: ProjectRecord;
    artifacts: ProductArtifactRef[];
    checkpoints: WorkflowCheckpoint[];
    runId: string;
  };
  previewed: {
    project: ProjectRecord;
    artifacts: ProductArtifactRef[];
    checkpoints: WorkflowCheckpoint[];
  };
} {
  const started = runStartGeneration(project, artifacts, now);
  const previewed = syncPreviewArtifacts(started.project, now);

  return {
    started,
    previewed,
  };
}

export function runLocalResumePhase(
  project: ProjectRecord,
  now = new Date().toISOString(),
): {
  resumed: {
    project: ProjectRecord;
    artifacts: ProductArtifactRef[];
    checkpoints: WorkflowCheckpoint[];
    runId: string;
  };
  previewed: {
    project: ProjectRecord;
    artifacts: ProductArtifactRef[];
    checkpoints: WorkflowCheckpoint[];
  };
} {
  const resumed = runResumeGeneration(project, now);
  const previewed = syncPreviewArtifacts(resumed.project, now);

  return {
    resumed,
    previewed,
  };
}

export function runLocalRevisionPhase(
  project: ProjectRecord,
  note: string,
  now = new Date().toISOString(),
): {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  checkpoints: WorkflowCheckpoint[];
  revisions: RevisionRequestRecord[];
} {
  return requestRevision(project, note, now);
}

export function runLocalExportPhase(
  project: ProjectRecord,
  now = new Date().toISOString(),
): {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  checkpoints: WorkflowCheckpoint[];
} {
  return exportLocalPhase(project, now);
}
