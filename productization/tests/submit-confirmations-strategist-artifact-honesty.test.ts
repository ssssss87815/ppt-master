import assert from 'node:assert/strict';

import { stubWriteConfirmationResult } from '../backend/adapter/pptmaster-adapter';
import type { ProjectRecord } from '../backend/models/projects';

function main() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-confirmation-honesty-project',
    name: 'PPTMASTER Confirmation Honesty Project',
    status: 'confirmation_pending',
    workspace: {
      projectId: 'pptmaster-confirmation-honesty-project',
      workspacePath: 'projects/pptmaster-confirmation-honesty-project',
    },
    latestCheckpointId: 'pptmaster-confirmation-honesty-project-checkpoint',
    createdAt: '2026-07-07T12:00:00.000Z',
    updatedAt: '2026-07-07T12:00:00.000Z',
  };

  const artifacts = stubWriteConfirmationResult({
    project,
    payload: {
      answers: {
        audience: 'Founders and seed investors',
        goal: 'Raise seed round',
        tone: 'Confident',
        language: 'zh-CN',
        brand: 'PPTMASTER',
        outline: 'problem-solution-proof-ask',
        visual_style: 'minimal dark',
        delivery: 'live pitch',
      },
      lockedAt: '2026-07-07T12:05:00.000Z',
    },
  });

  const designSpec = artifacts.find((item) => item.kind === 'design_spec');
  const specLock = artifacts.find((item) => item.kind === 'spec_lock');
  const confirmationResult = artifacts.find((item) => item.kind === 'confirmation_result');

  assert.ok(confirmationResult, 'confirmation_result artifact should still exist');
  assert.equal(designSpec?.status, 'pending');
  assert.equal(specLock?.status, 'pending');
  assert.equal(designSpec?.metadata?.verification, 'unverified_runtime_bridge');
  assert.equal(specLock?.metadata?.verification, 'unverified_runtime_bridge');

  console.log('submit-confirmations strategist artifact honesty test: ok');
}

main();
