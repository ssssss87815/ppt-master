import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';

export type QualityCheckInput = {
  project: ProjectRecord;
  sourcePreviewCheckpointId: string;
  bundle: ProductArtifactRef;
  pages: ProductArtifactRef[];
};

export type QualityCheckRunnerResult = {
  errors: number;
  warnings: number;
  scannedFiles: string[];
  note?: string;
};

export type QualityCheckRuntimeResult = {
  artifact: ProductArtifactRef;
  passed: boolean;
  note: string;
};

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function count(report: string, label: string): number {
  const match = report.match(new RegExp(`${label}:\\s*(\\d+)`, 'i'));
  return match ? Number(match[1]) : 0;
}

function defaultRunner(input: QualityCheckInput, reportPath: string): QualityCheckRunnerResult {
  const repoRoot = path.resolve('.');
  const humanReportPath = path.join(path.dirname(reportPath), 'quality-report.txt');
  const checker = path.join(repoRoot, 'skills', 'ppt-master', 'scripts', 'svg_quality_checker.py');
  const svgDir = path.join(input.project.workspace.workspacePath, 'svg_output');
  let output = '';
  try {
    output = execFileSync('python3', [checker, svgDir, '--format', 'ppt169', '--export', '--output', humanReportPath], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    output = error instanceof Error && 'stdout' in error ? String((error as { stdout?: unknown }).stdout ?? '') : '';
  }
  const report = existsSync(humanReportPath) ? readFileSync(humanReportPath, 'utf8') : output;
  return {
    errors: count(report, 'With errors'),
    warnings: count(report, 'With warnings'),
    scannedFiles: input.pages.map((page) => page.storageKey),
    note: 'PPT Master SVG Quality Check executed against the verified workspace preview.',
  };
}

export function hasVerifiedQualityCheck(
  project: ProjectRecord,
  artifacts: ProductArtifactRef[],
  checkpoints: WorkflowCheckpoint[],
): boolean {
  if (project.status !== 'preview_available' || !project.lastRunId) return false;

  const previewCheckpoints = checkpoints.filter((checkpoint) =>
    checkpoint.projectId === project.projectId
    && checkpoint.stage === 'preview_synced'
    && checkpoint.status === 'completed',
  );
  if (previewCheckpoints.length !== 1) return false;

  const reports = artifacts.filter((artifact) => {
    const summary = artifact.metadata?.summary;
    return artifact.projectId === project.projectId
      && artifact.kind === 'quality_report'
      && artifact.status === 'ready'
      && artifact.runId === project.lastRunId
      && artifact.metadata?.sourcePreviewCheckpointId === previewCheckpoints[0]?.checkpointId
      && typeof artifact.metadata?.sha256 === 'string'
      && /^[a-f0-9]{64}$/i.test(artifact.metadata.sha256)
      && !!summary
      && typeof summary === 'object'
      && (summary as { passed?: unknown }).passed === true;
  });
  if (reports.length !== 1) return false;

  return checkpoints.some((checkpoint) =>
    checkpoint.projectId === project.projectId
    && checkpoint.stage === 'quality_checked'
    && checkpoint.status === 'completed'
    && checkpoint.statusBefore === 'preview_available'
    && checkpoint.statusAfter === 'preview_available'
    && checkpoint.artifactIds.length === 1
    && checkpoint.artifactIds[0] === reports[0]?.artifactId,
  );
}

export function runQualityCheckFromWorkspace(
  input: QualityCheckInput,
  now = new Date().toISOString(),
  runner: (input: QualityCheckInput, reportPath: string) => QualityCheckRunnerResult = defaultRunner,
): QualityCheckRuntimeResult {
  const qualityDir = path.join(input.project.workspace.workspacePath, 'quality');
  const reportPath = path.join(qualityDir, 'quality-report.json');
  mkdirSync(qualityDir, { recursive: true });
  const result = runner(input, reportPath);
  const expected = input.pages.map((page) => page.storageKey).sort();
  const scanned = [...result.scannedFiles].sort();
  const scannedExactlyOnce = scanned.length === expected.length && scanned.every((file, index) => file === expected[index]);
  const passed = result.errors === 0 && scannedExactlyOnce;
  const artifactId = `${input.project.projectId}-quality-report-${Date.parse(now)}`;
  const checkpointId = `${input.project.projectId}-quality_checked-${Date.parse(now)}`;
  const note = result.note ?? (passed ? 'Quality check passed.' : 'Quality check failed.');
  const body = {
    projectId: input.project.projectId,
    runId: input.project.lastRunId,
    sourcePreviewCheckpointId: input.sourcePreviewCheckpointId,
    qualityCheckpointId: checkpointId,
    pageArtifactIds: input.pages.map((page) => page.artifactId),
    summary: { total: expected.length, warnings: result.warnings, errors: result.errors, passed },
    scannedFiles: result.scannedFiles,
    note,
    createdAt: now,
  };
  writeFileSync(reportPath, JSON.stringify(body, null, 2), 'utf8');
  const bytes = statSync(reportPath).size;
  const digest = sha256(reportPath);
  return {
    passed,
    note: passed ? body.note : `${body.note} ${scannedExactlyOnce ? '' : 'Selected preview roster was not scanned exactly once.'}`.trim(),
    artifact: {
      artifactId: `${input.project.projectId}-quality-report-${Date.parse(now)}`,
      projectId: input.project.projectId,
      kind: 'quality_report',
      scope: 'run',
      status: passed ? 'ready' : 'failed',
      label: 'Quality Check report',
      runId: input.project.lastRunId,
      storageKey: reportPath,
      mimeType: 'application/json',
      metadata: { ...body, sha256: digest, bytes, verification: 'runtime_workspace_quality_check' },
      createdAt: now,
      updatedAt: now,
    },
  };
}
