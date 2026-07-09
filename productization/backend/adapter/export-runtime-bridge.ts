import { execFileSync } from 'node:child_process';
import path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord } from '../models/projects';

export type ExportRuntimeResult = {
  artifacts: ProductArtifactRef[];
  runtimeStatus: 'exported' | 'failed';
  note: string;
};

export function runExportFromWorkspace(
  project: ProjectRecord,
  now = new Date().toISOString(),
  scriptPathOverride?: string,
): ExportRuntimeResult {
  const repoRoot = path.resolve('.');
  const projectPath = path.resolve(project.workspace.workspacePath);
  const scriptPath = path.resolve(scriptPathOverride ?? 'skills/ppt-master/scripts/productization_export_shim.py');

  try {
    const raw = execFileSync('python3', [scriptPath, projectPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const parsed = JSON.parse(raw) as {
      pptx_path: string;
      markdown_companion: string;
      image_manifest: string;
    };

    return {
      runtimeStatus: 'exported',
      note: 'Export bridge produced a PPTX and companion artifacts from the workspace.',
      artifacts: [
        {
          artifactId: `${project.projectId}-export-pptx`,
          projectId: project.projectId,
          kind: 'export_pptx',
          scope: 'run',
          status: 'ready',
          label: 'Exported PPTX deliverable',
          runId: project.lastRunId ?? `${project.projectId}-export-run`,
          storageKey: path.relative(repoRoot, parsed.pptx_path),
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          metadata: {
            role: 'export_deliverable',
            verification: 'exported_from_workspace_runtime',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          artifactId: `${project.projectId}-export-md`,
          projectId: project.projectId,
          kind: 'runtime_log',
          scope: 'run',
          status: 'ready',
          label: 'Export markdown companion',
          runId: project.lastRunId ?? `${project.projectId}-export-run`,
          storageKey: path.relative(repoRoot, parsed.markdown_companion),
          mimeType: 'text/markdown',
          metadata: {
            role: 'export_companion',
            verification: 'exported_from_workspace_runtime',
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          artifactId: `${project.projectId}-image-manifest`,
          projectId: project.projectId,
          kind: 'image_manifest',
          scope: 'run',
          status: 'ready',
          label: 'Export image manifest companion',
          runId: project.lastRunId ?? `${project.projectId}-export-run`,
          storageKey: path.relative(repoRoot, parsed.image_manifest),
          mimeType: 'application/json',
          metadata: {
            role: 'export_companion',
            verification: 'exported_from_workspace_runtime',
          },
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      runtimeStatus: 'failed',
      note: `Export bridge failed: ${message}`,
      artifacts: [],
    };
  }
}
