type Assert = (condition: boolean, message: string) => void;

import { runStartGeneration } from '../backend/orchestrator/phase-runner';
import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { ProjectRecord } from '../backend/models/projects';

const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function main() {
  const project: ProjectRecord = {
    projectId: 'pptmaster-generation-gated-project',
    name: 'PPTMASTER Generation Gated Project',
    status: 'spec_ready',
    workspace: {
      projectId: 'pptmaster-generation-gated-project',
      workspacePath: 'projects/pptmaster-generation-gated-project',
    },
    latestCheckpointId: 'pptmaster-generation-gated-project-checkpoint-spec-ready',
    createdAt: '2026-07-08T01:00:00.000Z',
    updatedAt: '2026-07-08T01:00:00.000Z',
  };

  const artifacts: ProductArtifactRef[] = [
    {
      artifactId: 'pptmaster-generation-gated-project-design-spec',
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
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
    {
      artifactId: 'pptmaster-generation-gated-project-spec-lock',
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
      },
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    },
  ];

  let error: unknown;

  try {
    runStartGeneration(project, artifacts, '2026-07-08T01:05:00.000Z');
  } catch (caught) {
    error = caught;
  }

  assert(error instanceof Error, 'runStartGeneration should reject unverified strategist outputs');
  assert(
    error instanceof Error && /verified strategist outputs/i.test(error.message),
    'generation gate error should explain strategist output verification requirement',
  );

  console.log('generation orchestrator gating test: ok');
}

main();
