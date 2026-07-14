import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';

export type PostProcessingRunnerInput = {
  project: ProjectRecord;
  sourcePreviewCheckpointId: string;
  sourceQualityCheckpointId: string;
  sourceQualityReportId: string;
  pages: ProductArtifactRef[];
};

export type PostProcessingRunnerResult = {
  errors: number;
  warnings: number;
  note?: string;
};

export type PostProcessingRuntimeResult = {
  artifacts: ProductArtifactRef[];
  passed: boolean;
  note: string;
};

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function withinWorkspace(workspace: string, candidate: string, requiredDirectory: string): boolean {
  const resolvedWorkspace = path.resolve(workspace);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate.startsWith(`${resolvedWorkspace}${path.sep}`)
    && resolvedCandidate.includes(`${path.sep}${requiredDirectory}${path.sep}`);
}

function defaultRunner(input: PostProcessingRunnerInput): PostProcessingRunnerResult {
  const repoRoot = path.resolve('.');
  const finalizer = path.join(repoRoot, 'skills', 'ppt-master', 'scripts', 'finalize_svg.py');
  try {
    execFileSync('python3', [finalizer, path.resolve(input.project.workspace.workspacePath), '--quiet'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { errors: 0, warnings: 0, note: 'PPT Master SVG post-processing completed.' };
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '';
    return { errors: 1, warnings: 0, note: `PPT Master SVG post-processing failed${stderr ? `: ${stderr.trim()}` : '.'}` };
  }
}

export function runPostProcessingFromWorkspace(
  input: PostProcessingRunnerInput,
  now = new Date().toISOString(),
  runner: (input: PostProcessingRunnerInput) => PostProcessingRunnerResult = defaultRunner,
): PostProcessingRuntimeResult {
  const workspace = path.resolve(input.project.workspace.workspacePath);
  const reportDir = path.join(workspace, 'post_processing');
  const reportPath = path.join(reportDir, 'post-processing-report.json');
  const runId = input.project.lastRunId!;
  mkdirSync(reportDir, { recursive: true });

  const result = runner(input);
  const expected = [...input.pages].sort((left, right) => String(left.pageKey).localeCompare(String(right.pageKey)));
  const finalDir = path.join(workspace, 'svg_final');
  const expectedNames = expected.map((page) => path.basename(page.storageKey));
  const finalNames = existsSync(finalDir)
    ? readdirSync(finalDir).filter((name) => name.endsWith('.svg')).sort()
    : [];
  const exactRoster = expectedNames.length > 0
    && expectedNames.length === finalNames.length
    && expectedNames.every((name, index) => name === finalNames[index]);

  const finalPages = exactRoster && result.errors === 0
    ? expected.map((page) => {
        const finalPath = path.join(finalDir, path.basename(page.storageKey));
        if (!withinWorkspace(workspace, finalPath, 'svg_final') || !existsSync(finalPath) || !statSync(finalPath).isFile()) return null;
        const sourceDigest = sha256(path.resolve(page.storageKey));
        const outputDigest = sha256(finalPath);
        return { page, finalPath, sourceDigest, outputDigest, bytes: statSync(finalPath).size };
      })
    : [];
  const passed = result.errors === 0 && exactRoster && finalPages.length === expected.length && finalPages.every(Boolean);
  const artifactBase = `${input.project.projectId}-post-processed-${Date.parse(now)}`;
  const pageArtifacts: ProductArtifactRef[] = passed
    ? (finalPages as NonNullable<typeof finalPages[number]>[]).map((final, index) => ({
        artifactId: `${artifactBase}-page-${index + 1}`,
        projectId: input.project.projectId,
        kind: 'final_page_svg',
        scope: 'page',
        status: 'ready',
        label: `Final SVG ${final.page.pageKey}`,
        pageKey: final.page.pageKey,
        runId,
        storageKey: final.finalPath,
        mimeType: 'image/svg+xml',
        metadata: {
          sourcePreviewArtifactId: final.page.artifactId,
          sourceSha256: final.sourceDigest,
          sha256: final.outputDigest,
          bytes: final.bytes,
          transform: 'finalize_svg.py',
        },
        createdAt: now,
        updatedAt: now,
      }))
    : [];
  const reportBody = {
    projectId: input.project.projectId,
    runId,
    sourcePreviewCheckpointId: input.sourcePreviewCheckpointId,
    sourceQualityCheckpointId: input.sourceQualityCheckpointId,
    sourceQualityReportId: input.sourceQualityReportId,
    inputPageArtifactIds: expected.map((page) => page.artifactId),
    inputPageHashes: expected.map((page) => ({ artifactId: page.artifactId, sha256: sha256(path.resolve(page.storageKey)) })),
    finalPageArtifactIds: pageArtifacts.map((page) => page.artifactId),
    finalPageHashes: pageArtifacts.map((page) => ({ artifactId: page.artifactId, sha256: page.metadata?.sha256 })),
    summary: { total: expected.length, warnings: result.warnings, errors: result.errors, passed },
    note: result.note ?? (passed ? 'Post-processing passed.' : 'Post-processing failed.'),
    createdAt: now,
  };
  writeFileSync(reportPath, JSON.stringify(reportBody, null, 2), 'utf8');
  const reportArtifact: ProductArtifactRef = {
    artifactId: `${artifactBase}-report`,
    projectId: input.project.projectId,
    kind: 'post_processing_report',
    scope: 'run',
    status: passed ? 'ready' : 'failed',
    label: 'Post-processing report',
    runId,
    storageKey: reportPath,
    mimeType: 'application/json',
    metadata: { ...reportBody, sha256: sha256(reportPath), bytes: statSync(reportPath).size },
    createdAt: now,
    updatedAt: now,
  };
  const bundleArtifact: ProductArtifactRef | undefined = passed
    ? {
        artifactId: `${artifactBase}-bundle`,
        projectId: input.project.projectId,
        kind: 'final_bundle',
        scope: 'run',
        status: 'ready',
        label: 'Final SVG bundle',
        runId,
        storageKey: reportPath,
        mimeType: 'application/json',
        metadata: {
          finalPageArtifactIds: pageArtifacts.map((page) => page.artifactId),
          sourceQualityCheckpointId: input.sourceQualityCheckpointId,
          sourceQualityReportId: input.sourceQualityReportId,
          sha256: sha256(reportPath),
        },
        createdAt: now,
        updatedAt: now,
      }
    : undefined;
  const note = passed
    ? reportBody.note
    : `${reportBody.note} ${exactRoster ? '' : 'Final SVG roster does not exactly match the verified preview roster.'}`.trim();
  return { passed, note, artifacts: [reportArtifact, ...(bundleArtifact ? [bundleArtifact, ...pageArtifacts] : [])] };
}
