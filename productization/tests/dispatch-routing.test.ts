type Assert = (condition: boolean, message: string) => void;

import { dispatchProductAction } from '../backend/orchestrator/dispatch';
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
  const calls: string[] = [];

  const adapter: PptmasterRuntimeAdapter = {
    async createProject() {
      calls.push('createProject');
      return makeResult('draft');
    },
    async importSources() {
      calls.push('importSources');
      return makeResult('sources_ready');
    },
    async prepareConfirmations() {
      calls.push('prepareConfirmations');
      return { ...makeResult('confirmation_pending'), recommendations: [] };
    },
    async submitConfirmations() {
      calls.push('submitConfirmations');
      return makeResult('spec_ready');
    },
    async startGeneration() {
      calls.push('startGeneration');
      return makeResult('generation_in_progress');
    },
    async resumeGeneration() {
      calls.push('resumeGeneration');
      return makeResult('generation_in_progress');
    },
    async requestRevision() {
      calls.push('requestRevision');
      return makeResult('revision_requested');
    },
    async exportPptx() {
      calls.push('exportPptx');
      return makeResult('export_ready');
    },
  };

  const actions: ProductAction[] = [
    { type: 'create_project', payload: { name: 'PPTMASTER Demo Project' } },
    { type: 'import_sources', payload: { projectId: 'pptmaster-demo-project', sources: [] } },
    { type: 'prepare_confirmations', payload: { projectId: 'pptmaster-demo-project' } },
    { type: 'submit_confirmations', payload: { projectId: 'pptmaster-demo-project', answers: {} } },
    { type: 'start_generation', payload: { projectId: 'pptmaster-demo-project' } },
    { type: 'resume_generation', payload: { projectId: 'pptmaster-demo-project' } },
    { type: 'request_revision', payload: { projectId: 'pptmaster-demo-project', note: 'Tighten the intro' } },
    { type: 'export_pptx', payload: { projectId: 'pptmaster-demo-project', format: 'pptx' } },
  ];

  for (const action of actions) {
    await dispatchProductAction(adapter, action);
  }

  assert(calls[0] === 'createProject', 'create_project should route to createProject');
  assert(calls[1] === 'importSources', 'import_sources should route to importSources');
  assert(calls[2] === 'prepareConfirmations', 'prepare_confirmations should route to prepareConfirmations');
  assert(calls[3] === 'submitConfirmations', 'submit_confirmations should route to submitConfirmations');
  assert(calls[4] === 'startGeneration', 'start_generation should route to startGeneration');
  assert(calls[5] === 'resumeGeneration', 'resume_generation should route to resumeGeneration');
  assert(calls[6] === 'requestRevision', 'request_revision should route to requestRevision');
  assert(calls[7] === 'exportPptx', 'export_pptx should route to exportPptx');

  console.log('dispatch routing test: ok');
}

void main();
