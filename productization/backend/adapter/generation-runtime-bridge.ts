import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord } from '../models/projects';

export type GenerationRuntimeResult = {
  artifacts: ProductArtifactRef[];
  runtimeStatus: 'generation_synced' | 'failed';
  note: string;
};

function listSvgFiles(workspacePath: string): string[] {
  const svgDir = path.join(workspacePath, 'svg_output');
  return readdirSync(svgDir)
    .filter((name) => name.endsWith('.svg'))
    .sort();
}

function collectPageMetadata(workspacePath: string, svgFiles: string[]): Array<{ filename: string; storageKey: string; sha256: string }> {
  const repoRoot = path.resolve('.');
  return svgFiles.map((filename) => {
    const absolute = path.join(workspacePath, 'svg_output', filename);
    const sha256 = createHash('sha256').update(readFileSync(absolute)).digest('hex');
    return {
      filename,
      storageKey: path.relative(repoRoot, absolute),
      sha256,
    };
  });
}

export function runGenerationFromWorkspace(
  project: ProjectRecord,
  now = new Date().toISOString(),
): GenerationRuntimeResult {
  const repoRoot = path.resolve('.');
  const workspacePath = path.resolve(project.workspace.workspacePath);
  const specLockPath = path.join(workspacePath, 'spec_lock.md');
  const designSpecPath = path.join(workspacePath, 'design_spec.md');
  const svgDir = path.join(workspacePath, 'svg_output');

  try {
    const specLockStat = statSync(specLockPath);
    const designSpecStat = statSync(designSpecPath);
    const svgFiles = listSvgFiles(workspacePath);
    if (!svgFiles.length) {
      throw new Error(`svg_output is empty: ${svgDir}`);
    }

    const latestSvgMtimeMs = Math.max(
      ...svgFiles.map((filename) => statSync(path.join(svgDir, filename)).mtimeMs),
    );
    const latestSpecMtimeMs = Math.max(specLockStat.mtimeMs, designSpecStat.mtimeMs);

    const evidence = latestSvgMtimeMs >= latestSpecMtimeMs ? 'svg_output_not_older_than_specs' : 'existing_workspace_svg_inventory';
    const pageMetadata = collectPageMetadata(workspacePath, svgFiles);

    const generationManifestPath = path.join(workspacePath, 'preview', 'generation-manifest.json');
    mkdirSync(path.dirname(generationManifestPath), { recursive: true });
    writeFileSync(
      generationManifestPath,
      JSON.stringify(
        {
          projectId: project.projectId,
          workspacePath: project.workspace.workspacePath,
          generatedAt: now,
          evidence,
          specLockPath: path.join(project.workspace.workspacePath, 'spec_lock.md'),
          designSpecPath: path.join(project.workspace.workspacePath, 'design_spec.md'),
          svgDir: path.join(project.workspace.workspacePath, 'svg_output'),
          svgCount: svgFiles.length,
          latestSvgMtimeMs,
          latestSpecMtimeMs,
          pages: pageMetadata,
        },
        null,
        2,
      ),
      'utf8',
    );

    const runId = project.lastRunId ?? `${project.projectId}-generation-run`;

    return {
      runtimeStatus: 'generation_synced',
      note: 'Generation bridge verified workspace SVG evidence and recorded a generation manifest.',
      artifacts: [
        {
          artifactId: `${project.projectId}-generation-manifest`,
          projectId: project.projectId,
          kind: 'runtime_log',
          scope: 'run',
          status: 'ready',
          label: 'Generation runtime evidence manifest',
          runId,
          storageKey: path.relative(repoRoot, generationManifestPath),
          mimeType: 'application/json',
          metadata: {
            role: 'generation_evidence',
            verification: 'runtime_workspace_generation_bridge',
            evidence,
            svgCount: svgFiles.length,
            pages: pageMetadata,
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
      note: `Generation bridge failed: ${message}`,
      artifacts: [],
    };
  }
}
