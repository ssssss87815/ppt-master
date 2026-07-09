type Assert = (condition: boolean, message: string) => void;

import { runResumeGeneration } from '../backend/orchestrator/phase-runner';
import type { ProductAction } from '../backend/models/actions';
import type { PptmasterRuntimeAdapter, ProductActionResult } from '../backend/adapter/interface';
import type { ProjectRecord } from '../backend/models/projects';
import { toProjectViewModel } from '../backend/services/project-view-service';
import { dispatchProductAction } from '../backend/orchestrator/dispatch';

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function makeRecoverableProject(): ProjectRecord {
  return {
    projectId: 'pptmaster-demo-project',
    name: 'PPTMASTER Demo Project',
    status: 'failed_recoverable',
    workspace: {
      projectId: 'pptmaster-demo-project',
      workspacePath: 'projects/pptmaster-demo-project',
    },
    latestCheckpointId: 'pptmaster-demo-project-generation-started-1751300400000',
    lastRunId: 'pptmaster-demo-project-run-1751300400000',
    lastError: 'Preview sync timed out while waiting for bundle upload.',
    createdAt: '2026-06-30T16:00:00.000Z',
    updatedAt: '2026-06-30T16:26:00.000Z',
  };
}

function makeResult(status: ProjectRecord['status']): ProductActionResult {
  return {
    project: {
      ...makeRecoverableProject(),
      status,
      updatedAt: '2026-06-30T16:35:00.000Z',
    },
    artifacts: [],
    nextStatus: status,
  };
}

async function main() {
  const recoverable = makeRecoverableProject();

  let resumeRejected = false;
  try {
    runResumeGeneration(recoverable, '2026-06-30T16:35:00.000Z');
  } catch (error) {
    resumeRejected = true;
    assert(
      error instanceof Error && error.message.includes('resume_generation requires revision_requested status with a revision record'),
      'failed_recoverable local resume should reject until a revision-backed recovery bridge exists',
    );
  }
  assert(resumeRejected, 'failed_recoverable should not enter generation_in_progress through local resume without a revision record');

  const failedView = toProjectViewModel(recoverable, [], [], undefined);
  assert(failedView.status === 'failed_recoverable', 'failed view should preserve failed_recoverable status');
  assert((failedView as { lastError?: string }).lastError === undefined, 'failed view currently does not project lastError into the view model');
  assert(failedView.latestCheckpoint === undefined, 'failed view should not invent latestCheckpoint without checkpoint payload');
  assert(failedView.lastUpdatedAt === recoverable.updatedAt, 'failed view should preserve project updatedAt');
  assert(failedView.lastStartedCheckpoint === undefined, 'failed view should not invent a last started checkpoint without checkpoint payload');
  assert(failedView.artifactSummary?.failed === 0, 'failed view should expose zero failed artifacts when none are supplied');
  assert(failedView.timeline[0]?.key === 'sources', 'failed view should keep timeline anchored at source intake first');
  assert(
    failedView.nextActions.every((action) => action !== 'Resume generation'),
    'failed_recoverable view should not advertise resume generation before a revision-backed recovery bridge exists',
  );
  assert(failedView.timeline.every((item) => item.status !== 'failed_recoverable'), 'failed_recoverable should remain an out-of-band status, not a normal timeline step');

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

  const action: ProductAction = {
    type: 'resume_generation',
    payload: {
      projectId: recoverable.projectId,
      fromStatus: 'failed_recoverable',
    },
  };
  await dispatchProductAction(adapter, action);
  assert(calls[0] === 'resumeGeneration', 'resume_generation from failed_recoverable should still route to resumeGeneration');

  console.log('recoverable failure slice test: ok');
}

void main();
