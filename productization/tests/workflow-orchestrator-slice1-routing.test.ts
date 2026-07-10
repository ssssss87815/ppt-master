type Assert = (condition: boolean, message: string) => void;

import { runWorkflowAction } from '../backend/orchestrator/workflow-orchestrator';
import type { ProductAction } from '../backend/models/actions';
import type { PptmasterRuntimeAdapter, ProductActionResult } from '../backend/adapter/interface';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function makeProject(status: ProjectRecord['status']): ProjectRecord {
  return {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status,
    workspace: {
      projectId: 'pptmaster-demo-project',
      workspacePath: 'projects/pptmaster-demo-project',
    },
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:00:00.000Z',
  };
}

function makeResult(status: ProjectRecord['status']): ProductActionResult {
  return {
    project: {
      ...makeProject(status),
      latestCheckpointId: `pptmaster-demo-project-${status}-checkpoint`,
    },
    artifacts: [
      {
        artifactId: `artifact-${status}`,
        projectId: 'pptmaster-demo-project',
        kind:
          status === 'sources_ready'
            ? 'source_original'
            : status === 'confirmation_pending'
              ? 'confirmation_recommendations'
              : status === 'spec_ready'
                ? 'design_spec'
                : 'runtime_log',
        scope: 'project',
        status: 'ready',
        storageKey: `projects/pptmaster-demo-project/${status}.json`,
        createdAt: '2026-06-30T16:00:00.000Z',
        updatedAt: '2026-06-30T16:00:00.000Z',
      },
      ...(status === 'spec_ready'
        ? [
            {
              artifactId: 'artifact-spec-lock',
              projectId: 'pptmaster-demo-project',
              kind: 'spec_lock' as const,
              scope: 'project' as const,
              status: 'ready' as const,
              storageKey: 'projects/pptmaster-demo-project/spec_lock.md',
              createdAt: '2026-06-30T16:00:00.000Z',
              updatedAt: '2026-06-30T16:00:00.000Z',
            },
          ]
        : []),
    ],
    nextStatus: status,
  };
}

async function main() {
  const adapter: PptmasterRuntimeAdapter = {
    async createProject() {
      return makeResult('draft');
    },
    async importSources() {
      return makeResult('sources_ready');
    },
    async prepareConfirmations() {
      return { ...makeResult('confirmation_pending'), recommendations: [] };
    },
    async submitConfirmations() {
      return makeResult('spec_ready');
    },
    async startGeneration() {
      return makeResult('generation_in_progress');
    },
    async resumeGeneration() {
      return makeResult('generation_in_progress');
    },
    async requestRevision() {
      return makeResult('revision_requested');
    },
    async exportPptx() {
      return makeResult('export_ready');
    },
  };

  const draft = makeProject('draft');
  const importAction: ProductAction = {
    type: 'import_sources',
    payload: {
      projectId: draft.projectId,
      sources: [{ kind: 'text', value: 'seed narrative', label: 'Seed memo' }],
    },
  };
  const imported = await runWorkflowAction(adapter, importAction, draft);
  assert(imported.project.status === 'sources_ready', 'import_sources should advance to sources_ready');
  assert(imported.nextStatus === 'sources_ready', 'import_sources should expose nextStatus for orchestration consumers');
  assert(imported.artifacts.some((item) => item.kind === 'source_original'), 'import_sources should emit source_original artifact');

  const prepareAction: ProductAction = {
    type: 'prepare_confirmations',
    payload: { projectId: imported.project.projectId },
  };
  const prepared = await runWorkflowAction(adapter, prepareAction, imported.project);
  assert(prepared.project.status === 'confirmation_pending', 'prepare_confirmations should advance to confirmation_pending');
  assert(prepared.nextStatus === 'confirmation_pending', 'prepare_confirmations should expose nextStatus for orchestration consumers');
  const preparedRecommendations = 'recommendations' in prepared ? prepared.recommendations : undefined;
  assert(Array.isArray(preparedRecommendations), 'prepare_confirmations should expose recommendations');
  assert(prepared.artifacts[0]?.kind === 'confirmation_recommendations', 'prepare_confirmations should emit recommendation artifact');

  const submitAction: ProductAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: prepared.project.projectId,
      answers: {
        audience: 'Founders',
        goal: 'Raise seed round',
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-traction',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
    },
  };
  const submitted = await runWorkflowAction(adapter, submitAction, prepared.project);
  assert(
    submitted.project.status === 'spec_ready',
    'submit_confirmations should advance to spec_ready because current implementation is beyond the original Slice 1 confirmation_locked boundary',
  );
  assert(
    submitted.nextStatus === 'spec_ready',
    'submit_confirmations should expose nextStatus for orchestration consumers because current implementation is beyond the original Slice 1 confirmation_locked boundary',
  );
  assert(typeof submitted.project.latestCheckpointId === 'string', 'submit_confirmations should stamp a latestCheckpointId on project state');
  assert(Boolean(submitted.project.latestCheckpointId?.includes('spec_ready')), 'submit_confirmations should preserve latest checkpoint information from the adapter result');
  assert(submitted.artifacts.some((item) => item.kind === 'design_spec'), 'submit_confirmations should emit design_spec artifact');
  assert(submitted.artifacts.some((item) => item.kind === 'spec_lock'), 'submit_confirmations should emit spec_lock artifact');

  let startGenerationFromConfirmationLockedError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'start_generation', payload: { projectId: submitted.project.projectId } },
      makeProject('confirmation_locked'),
    );
  } catch (error) {
    startGenerationFromConfirmationLockedError = error instanceof Error ? error.message : String(error);
  }
  assert(
    startGenerationFromConfirmationLockedError.includes('start_generation requires project status spec_ready'),
    'start_generation should require spec_ready instead of allowing confirmation_locked at the workflow action surface',
  );

  let prepareError = '';
  try {
    await runWorkflowAction(adapter, prepareAction);
  } catch (error) {
    prepareError = error instanceof Error ? error.message : String(error);
  }
  assert(prepareError.includes('prepare_confirmations requires project context'), 'prepare_confirmations should require project context');

  let submitError = '';
  try {
    await runWorkflowAction(adapter, submitAction);
  } catch (error) {
    submitError = error instanceof Error ? error.message : String(error);
  }
  assert(submitError.includes('submit_confirmations requires project context'), 'submit_confirmations should require project context');

  console.log('workflow orchestrator slice-1 routing test: ok');
}

void main();
