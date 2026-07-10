import { execFileSync } from 'node:child_process';
import path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { SubmitConfirmationsPayload } from '../models/confirmations';
import type { ProjectRecord } from '../models/projects';

export type StrategistRuntimeBridgeParams = {
  project: ProjectRecord;
  payload: SubmitConfirmationsPayload;
  now?: string;
  scriptPathOverride?: string;
};

export type StrategistRuntimeBridgeResult = {
  artifacts: ProductArtifactRef[];
  runtimeStatus: 'materialized' | 'unimplemented';
  note: string;
};

export function runStrategistFromLockedConfirmations({
  project,
  payload,
  now = payload.lockedAt ?? new Date().toISOString(),
  scriptPathOverride,
}: StrategistRuntimeBridgeParams): StrategistRuntimeBridgeResult {
  const lockedAt = payload.lockedAt ?? now;
  const repoRoot = path.resolve('.');
  const projectPath = path.resolve(project.workspace.workspacePath);
  const expectedOutputs = [path.join(projectPath, 'design_spec.md'), path.join(projectPath, 'spec_lock.md')];
  const scriptPath = path.resolve(scriptPathOverride ?? 'skills/ppt-master/scripts/materialize_from_confirmations.py');

  try {
    execFileSync('python3', [scriptPath, projectPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    return {
      runtimeStatus: 'materialized',
      note:
        'Strategist bridge materialized canonical markdown artifacts from locked confirmations via a minimal executor shim.',
      artifacts: [
        {
          artifactId: `${project.projectId}-design-spec`,
          projectId: project.projectId,
          kind: 'design_spec',
          scope: 'project',
          status: 'ready',
          label: 'Strategist design specification (materialized from locked confirmations)',
          storageKey: `${project.workspace.workspacePath}/design_spec.md`,
          mimeType: 'text/markdown',
          metadata: {
            role: 'strategist_output',
            verification: 'materialized_from_locked_confirmations',
            source: 'productization_strategist_bridge_contract',
            contract: {
              projectPath: project.workspace.workspacePath,
              lockedConfirmationResultPath: `${project.workspace.workspacePath}/confirmations/result.json`,
              sourcePaths: [`${project.workspace.workspacePath}/sources`],
              expectedOutputs: expectedOutputs.map((item) => path.relative(repoRoot, item)),
            },
          },
          createdAt: lockedAt,
          updatedAt: lockedAt,
        },
        {
          artifactId: `${project.projectId}-spec-lock`,
          projectId: project.projectId,
          kind: 'spec_lock',
          scope: 'project',
          status: 'locked',
          label: 'Executor entry spec lock (materialized from locked confirmations)',
          storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
          mimeType: 'text/markdown',
          metadata: {
            role: 'strategist_output',
            verification: 'materialized_from_locked_confirmations',
            source: 'productization_strategist_bridge_contract',
            contract: {
              projectPath: project.workspace.workspacePath,
              lockedConfirmationResultPath: `${project.workspace.workspacePath}/confirmations/result.json`,
              sourcePaths: [`${project.workspace.workspacePath}/sources`],
              expectedOutputs: expectedOutputs.map((item) => path.relative(repoRoot, item)),
            },
          },
          createdAt: lockedAt,
          updatedAt: lockedAt,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      runtimeStatus: 'unimplemented',
      note: `Strategist runtime bridge failed to materialize artifacts: ${message}`,
      artifacts: [
        {
          artifactId: `${project.projectId}-design-spec`,
          projectId: project.projectId,
          kind: 'design_spec',
          scope: 'project',
          status: 'pending',
          label: 'Strategist design specification (bridge contract defined, runtime failed)',
          storageKey: `${project.workspace.workspacePath}/design_spec.md`,
          mimeType: 'text/markdown',
          metadata: {
            role: 'strategist_output',
            verification: 'unverified_runtime_bridge',
            source: 'productization_strategist_bridge_contract',
            error: message,
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
          label: 'Executor entry spec lock (bridge contract defined, runtime failed)',
          storageKey: `${project.workspace.workspacePath}/spec_lock.md`,
          mimeType: 'text/markdown',
          metadata: {
            role: 'strategist_output',
            verification: 'unverified_runtime_bridge',
            source: 'productization_strategist_bridge_contract',
            error: message,
          },
          createdAt: lockedAt,
          updatedAt: lockedAt,
        },
      ],
    };
  }
}
