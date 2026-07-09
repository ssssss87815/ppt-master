type Assert = (condition: boolean, message: string) => void;

import { runWorkflowAction } from '../backend/orchestrator/workflow-orchestrator';
import type { ProductAction } from '../backend/models/actions';
import type { PptmasterRuntimeAdapter, ProductActionResult } from '../backend/adapter/interface';
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
    project: makeProject(status),
    artifacts: [],
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

  const prepareAction: ProductAction = {
    type: 'prepare_confirmations',
    payload: { projectId: 'pptmaster-demo-project' },
  };
  const submitAction: ProductAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: 'pptmaster-demo-project',
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

  let prepareFromDraftError = '';
  try {
    await runWorkflowAction(adapter, prepareAction, makeProject('draft'));
  } catch (error) {
    prepareFromDraftError = error instanceof Error ? error.message : String(error);
  }
  assert(
    prepareFromDraftError.includes('prepare_confirmations requires project status sources_ready'),
    'prepare_confirmations should reject draft -> confirmation_pending',
  );

  let submitFromDraftError = '';
  try {
    await runWorkflowAction(adapter, submitAction, makeProject('draft'));
  } catch (error) {
    submitFromDraftError = error instanceof Error ? error.message : String(error);
  }
  assert(
    submitFromDraftError.includes('submit_confirmations requires project status confirmation_pending'),
    'submit_confirmations should reject draft -> confirmation_locked/spec_ready boundary',
  );

  let submitFromSourcesReadyError = '';
  try {
    await runWorkflowAction(adapter, submitAction, makeProject('sources_ready'));
  } catch (error) {
    submitFromSourcesReadyError = error instanceof Error ? error.message : String(error);
  }
  assert(
    submitFromSourcesReadyError.includes('submit_confirmations requires project status confirmation_pending'),
    'submit_confirmations should reject sources_ready -> confirmation_locked/spec_ready boundary',
  );

  let importFromConfirmationPendingError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'import_sources', payload: { projectId: 'pptmaster-demo-project', sources: [] } },
      makeProject('confirmation_pending'),
    );
  } catch (error) {
    importFromConfirmationPendingError = error instanceof Error ? error.message : String(error);
  }
  assert(
    importFromConfirmationPendingError.includes('import_sources requires project status draft'),
    'import_sources should reject confirmation_pending -> sources_ready in Slice 1',
  );

  let createFromConfirmationLockedError = '';
  try {
    await runWorkflowAction(adapter, { type: 'create_project', payload: { name: 'PPTMASTER Demo Project' } }, makeProject('confirmation_locked'));
  } catch (error) {
    createFromConfirmationLockedError = error instanceof Error ? error.message : String(error);
  }
  assert(
    createFromConfirmationLockedError.includes('create_project does not accept an existing project context'),
    'create_project should reject confirmation_locked -> draft in Slice 1 orchestration',
  );

  let prepareFromConfirmationLockedError = '';
  try {
    await runWorkflowAction(adapter, prepareAction, makeProject('confirmation_locked'));
  } catch (error) {
    prepareFromConfirmationLockedError = error instanceof Error ? error.message : String(error);
  }
  assert(
    prepareFromConfirmationLockedError.includes('prepare_confirmations requires project status sources_ready'),
    'prepare_confirmations should reject confirmation_locked -> confirmation_pending in Slice 1',
  );

  let startGenerationFromConfirmationPendingError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'start_generation', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('confirmation_pending'),
    );
  } catch (error) {
    startGenerationFromConfirmationPendingError = error instanceof Error ? error.message : String(error);
  }
  assert(
    startGenerationFromConfirmationPendingError.includes('start_generation requires project status spec_ready'),
    'start_generation should reject confirmation_pending -> generation_in_progress per the doc-anchored illegal transition list',
  );

  let startGenerationFromPreviewAvailableError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'start_generation', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('preview_available'),
    );
  } catch (error) {
    startGenerationFromPreviewAvailableError = error instanceof Error ? error.message : String(error);
  }
  assert(
    startGenerationFromPreviewAvailableError.includes('start_generation requires project status spec_ready'),
    'start_generation should reject preview_available -> generation_in_progress per the doc-anchored illegal transition list',
  );

  let exportFromSourcesReadyError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'export_pptx', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('sources_ready'),
    );
  } catch (error) {
    exportFromSourcesReadyError = error instanceof Error ? error.message : String(error);
  }
  assert(
    exportFromSourcesReadyError.includes('export_pptx requires project status preview_available'),
    'export_pptx should reject sources_ready -> export_ready per the doc-anchored illegal transition list',
  );

  let exportFromRevisionRequestedError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'export_pptx', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('revision_requested'),
    );
  } catch (error) {
    exportFromRevisionRequestedError = error instanceof Error ? error.message : String(error);
  }
  assert(
    exportFromRevisionRequestedError.includes('export_pptx requires project status preview_available'),
    'export_pptx should reject revision_requested -> export_ready because export remains gated behind preview_available at the workflow action surface',
  );

  let exportFromConfirmationPendingError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'export_pptx', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('confirmation_pending'),
    );
  } catch (error) {
    exportFromConfirmationPendingError = error instanceof Error ? error.message : String(error);
  }
  assert(
    exportFromConfirmationPendingError.includes('export_pptx requires project status preview_available'),
    'export_pptx should reject confirmation_pending -> export_ready because export remains doc-gated behind preview_available at the workflow action surface',
  );

  let exportFromConfirmationLockedError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'export_pptx', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('confirmation_locked'),
    );
  } catch (error) {
    exportFromConfirmationLockedError = error instanceof Error ? error.message : String(error);
  }
  assert(
    exportFromConfirmationLockedError.includes('export_pptx requires project status preview_available'),
    'export_pptx should reject confirmation_locked -> export_ready because the doc-anchored workflow keeps export behind preview_available at the workflow action surface',
  );

  let exportFromFailedRecoverableError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'export_pptx', payload: { projectId: 'pptmaster-demo-project' } },
      makeProject('failed_recoverable'),
    );
  } catch (error) {
    exportFromFailedRecoverableError = error instanceof Error ? error.message : String(error);
  }
  assert(
    exportFromFailedRecoverableError.includes('export_pptx requires project status preview_available'),
    'export_pptx should reject failed_recoverable -> export_ready because the doc-anchored workflow keeps recoverable failures on the resume path rather than allowing a direct export jump',
  );

  let requestRevisionFromConfirmationLockedError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'request_revision', payload: { projectId: 'pptmaster-demo-project', note: 'Tighten the intro' } },
      makeProject('confirmation_locked'),
    );
  } catch (error) {
    requestRevisionFromConfirmationLockedError = error instanceof Error ? error.message : String(error);
  }
  assert(
    requestRevisionFromConfirmationLockedError.includes('request_revision requires project status preview_available'),
    'request_revision should reject confirmation_locked -> revision_requested because the workflow only allows revision requests after preview_available',
  );

  let requestRevisionFromConfirmationPendingError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'request_revision', payload: { projectId: 'pptmaster-demo-project', note: 'Tighten the intro' } },
      makeProject('confirmation_pending'),
    );
  } catch (error) {
    requestRevisionFromConfirmationPendingError = error instanceof Error ? error.message : String(error);
  }
  assert(
    requestRevisionFromConfirmationPendingError.includes('request_revision requires project status preview_available'),
    'request_revision should reject confirmation_pending -> revision_requested because the workflow only allows revision requests after preview_available',
  );

  let requestRevisionFromFailedRecoverableError = '';
  try {
    await runWorkflowAction(
      adapter,
      { type: 'request_revision', payload: { projectId: 'pptmaster-demo-project', note: 'Tighten the intro' } },
      makeProject('failed_recoverable'),
    );
  } catch (error) {
    requestRevisionFromFailedRecoverableError = error instanceof Error ? error.message : String(error);
  }
  assert(
    requestRevisionFromFailedRecoverableError.includes('request_revision requires project status preview_available'),
    'request_revision should reject failed_recoverable -> needs_revision because recoverable failures stay on the resume path until preview_available is re-established',
  );

  console.log('slice-1 illegal transitions test: ok');
}

void main();
