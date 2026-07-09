import { readdirSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord } from '../models/projects';

export type PreviewRuntimeResult = {
  artifacts: ProductArtifactRef[];
  runtimeStatus: 'preview_synced' | 'failed';
  note: string;
};

function listSvgFiles(svgDir: string): string[] {
  return readdirSync(svgDir)
    .filter((name) => name.endsWith('.svg'))
    .sort();
}

function readGenerationManifest(workspacePath: string): {
  generatedAt?: string;
  pages?: Array<{ filename?: string; storageKey?: string; sha256?: string }>;
} {
  const manifestPath = path.join(workspacePath, 'preview', 'generation-manifest.json');
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      generatedAt?: string;
      pages?: Array<{ filename?: string; storageKey?: string; sha256?: string }>;
    };
  } catch {
    return {};
  }
}

export function runPreviewFromWorkspace(
  project: ProjectRecord,
  now = new Date().toISOString(),
): PreviewRuntimeResult {
  const repoRoot = path.resolve('.');
  const workspacePath = path.resolve(project.workspace.workspacePath);
  const svgDir = path.join(workspacePath, 'svg_output');
  const previewDir = path.join(workspacePath, 'preview');

  try {
    const svgFiles = listSvgFiles(svgDir);
    if (!svgFiles.length) {
      throw new Error(`svg_output is empty: ${svgDir}`);
    }

    mkdirSync(previewDir, { recursive: true });
    const generationManifest = readGenerationManifest(workspacePath);
    const generationPages = Array.isArray(generationManifest.pages) ? generationManifest.pages : [];

    const manifestPath = path.join(previewDir, 'index.json');
    const manifest = {
      projectId: project.projectId,
      workspacePath: project.workspace.workspacePath,
      generatedAt: now,
      generationManifestGeneratedAt: generationManifest.generatedAt,
      generationManifestPageCount: generationPages.length,
      pages: svgFiles.map((filename, index) => {
        const sourceSvg = path.join(project.workspace.workspacePath, 'svg_output', filename);
        const matchedGenerationPage = generationPages.find((page, pageIndex) => {
          const storageKey = String(page?.storageKey ?? '');
          return (
            page?.filename === filename ||
            storageKey === sourceSvg ||
            storageKey.endsWith(`/svg_output/${filename}`) ||
            storageKey.endsWith(`\\svg_output\\${filename}`) ||
            path.basename(storageKey) === filename ||
            pageIndex === index
          );
        });
        return {
          pageKey: `page-${index + 1}`,
          sourceSvg,
          previewSvg: path.join(project.workspace.workspacePath, 'preview', `page-${index + 1}.svg`),
          label: filename,
          generationProvenance: matchedGenerationPage
            ? {
                filename: matchedGenerationPage.filename,
                storageKey: matchedGenerationPage.storageKey,
                sha256: matchedGenerationPage.sha256,
              }
            : null,
        };
      }),
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const bundleArtifact: ProductArtifactRef = {
      artifactId: `${project.projectId}-preview-bundle`,
      projectId: project.projectId,
      kind: 'preview_bundle',
      scope: 'run',
      status: 'ready',
      label: 'Preview bundle manifest',
      runId: project.lastRunId ?? `${project.projectId}-preview-run`,
      storageKey: path.relative(repoRoot, manifestPath),
      mimeType: 'application/json',
      metadata: {
        role: 'preview_bundle',
        verification: 'runtime_workspace_preview_bridge',
        pageCount: svgFiles.length,
        generationManifestGeneratedAt: generationManifest.generatedAt,
        generationManifestPageCount: generationPages.length,
      },
      createdAt: now,
      updatedAt: now,
    };

    const pageArtifacts = manifest.pages.map((page) => ({
      artifactId: `${project.projectId}-${page.pageKey}`,
      projectId: project.projectId,
      kind: 'preview_page_svg' as const,
      scope: 'page' as const,
      status: 'ready' as const,
      label: `Preview page ${page.pageKey}`,
      pageKey: page.pageKey,
      runId: project.lastRunId ?? `${project.projectId}-preview-run`,
      storageKey: page.sourceSvg,
      mimeType: 'image/svg+xml',
      metadata: {
        role: 'preview_page',
        verification: 'runtime_workspace_preview_bridge',
        sourceSvg: page.sourceSvg,
        previewSvg: page.previewSvg,
        generationProvenance: page.generationProvenance,
      },
      createdAt: now,
      updatedAt: now,
    }));

    return {
      runtimeStatus: 'preview_synced',
      note: 'Preview bridge mirrored existing workspace SVG outputs into productization preview artifacts.',
      artifacts: [bundleArtifact, ...pageArtifacts],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      runtimeStatus: 'failed',
      note: `Preview bridge failed: ${message}`,
      artifacts: [],
    };
  }
}
