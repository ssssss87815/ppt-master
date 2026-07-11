import { execFileSync } from 'node:child_process';
import path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord } from '../models/projects';

export type StagedRuntimeOutput = {
  pptxPath: string;
  markdownCompanionPath: string;
  imageManifestPath: string;
};

export type StagedRuntimeResult =
  | { runtimeStatus: 'exported'; note: string; output: StagedRuntimeOutput }
  | { runtimeStatus: 'failed'; note: string };

export type ExportRuntimeResult = {
  artifacts: ProductArtifactRef[];
  runtimeStatus: 'exported' | 'failed';
  note: string;
};

/** The runtime/shim boundary. Durable artifact projection belongs to a later persistence layer. */
export function runExportToStaging(
  project: ProjectRecord,
  stageDir: string,
  scriptPathOverride?: string,
): StagedRuntimeResult {
  const repoRoot = path.resolve('.');
  const projectPath = path.resolve(project.workspace.workspacePath);
  const scriptPath = path.resolve(scriptPathOverride ?? 'skills/ppt-master/scripts/productization_export_shim.py');

  try {
    const raw = execFileSync('python3', [scriptPath, projectPath, stageDir], {
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
      note: 'Export bridge staged a PPTX and companion artifacts from the workspace.',
      output: {
        pptxPath: path.resolve(parsed.pptx_path),
        markdownCompanionPath: path.resolve(parsed.markdown_companion),
        imageManifestPath: path.resolve(parsed.image_manifest),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { runtimeStatus: 'failed', note: `Export bridge failed: ${message}` };
  }
}

/**
 * Legacy local-only adapter retained for existing tests. It is intentionally not a durable delivery path.
 * New staged-export callers must use runStagedExportBridge, which validates preview evidence first.
 */
export function runExportFromWorkspace(
  project: ProjectRecord,
  now = new Date().toISOString(),
  scriptPathOverride?: string,
): ExportRuntimeResult {
  const repoRoot = path.resolve('.');
  const stageDir = path.resolve(project.workspace.workspacePath, '.legacy-export-staging');
  const runtime = runExportToStaging(project, stageDir, scriptPathOverride);
  if (runtime.runtimeStatus === 'failed') return { runtimeStatus: 'failed', note: runtime.note, artifacts: [] };

  const output = runtime.output;
  return {
    runtimeStatus: 'exported',
    note: runtime.note,
    artifacts: [
      {
        artifactId: `${project.projectId}-export-pptx`, projectId: project.projectId, kind: 'export_pptx', scope: 'run', status: 'ready',
        label: 'Legacy local export PPTX (not durable delivery)', runId: project.lastRunId ?? `${project.projectId}-export-run`,
        storageKey: path.relative(repoRoot, output.pptxPath), mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        metadata: { role: 'legacy_local_export', verification: 'exported_from_workspace_runtime' }, createdAt: now, updatedAt: now,
      },
      {
        artifactId: `${project.projectId}-export-md`, projectId: project.projectId, kind: 'runtime_log', scope: 'run', status: 'ready',
        label: 'Legacy export markdown companion', runId: project.lastRunId ?? `${project.projectId}-export-run`,
        storageKey: path.relative(repoRoot, output.markdownCompanionPath), mimeType: 'text/markdown',
        metadata: { role: 'legacy_local_export_companion', verification: 'exported_from_workspace_runtime' }, createdAt: now, updatedAt: now,
      },
      {
        artifactId: `${project.projectId}-image-manifest`, projectId: project.projectId, kind: 'image_manifest', scope: 'run', status: 'ready',
        label: 'Legacy export image manifest companion', runId: project.lastRunId ?? `${project.projectId}-export-run`,
        storageKey: path.relative(repoRoot, output.imageManifestPath), mimeType: 'application/json',
        metadata: { role: 'legacy_local_export_companion', verification: 'exported_from_workspace_runtime' }, createdAt: now, updatedAt: now,
      },
    ],
  };
}
