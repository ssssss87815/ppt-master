import { spawnSync } from 'node:child_process';
import path from 'node:path';

export type ProjectManagerInitResult = {
  stdout: string;
  stderr: string;
  createdWorkspacePath: string;
};

export type ProjectManagerImportSourcesResult = {
  stdout: string;
  stderr: string;
};

export type ProjectManagerValidateResult = {
  stdout: string;
  stderr: string;
  isValid: boolean;
};

export type ProjectManagerInfoResult = {
  stdout: string;
  stderr: string;
};

export type ProjectManagerInitParams = {
  repoRoot: string;
  projectName: string;
  format?: string;
};

export type ProjectManagerImportSourcesParams = {
  repoRoot: string;
  projectPath: string;
  sourceItems: string[];
};

export type ProjectManagerProjectPathParams = {
  repoRoot: string;
  projectPath: string;
};

const DEFAULT_FORMAT = 'ppt169';

function runProjectManager(repoRoot: string, args: string[]) {
  const scriptPath = path.join(repoRoot, 'skills/ppt-master/scripts/project_manager.py');

  const result = spawnSync('python3', [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  if (result.status !== 0) {
    throw new Error(
      `project_manager ${args[0]} failed (exit=${result.status}): ${stderr || stdout || 'no output'}`,
    );
  }

  return { stdout, stderr };
}

function extractWorkspacePath(output: string): string | null {
  const match = output.match(/\/home\/ubuntu\/projects\/ppt-master-upstream\/projects\/[A-Za-z0-9._\-/]+|projects\/[A-Za-z0-9._\-/]+/);

  if (!match) {
    return null;
  }

  return match[0];
}

export function runProjectManagerInit({
  repoRoot,
  projectName,
  format = DEFAULT_FORMAT,
}: ProjectManagerInitParams): ProjectManagerInitResult {
  const { stdout, stderr } = runProjectManager(repoRoot, ['init', projectName, '--format', format]);

  const createdWorkspacePath = extractWorkspacePath(stdout + '\n' + stderr);

  if (!createdWorkspacePath) {
    throw new Error(
      `project_manager init succeeded but workspace path could not be parsed from output: ${stdout || stderr || 'no output'}`,
    );
  }

  return {
    stdout,
    stderr,
    createdWorkspacePath,
  };
}

export function runProjectManagerImportSources({
  repoRoot,
  projectPath,
  sourceItems,
}: ProjectManagerImportSourcesParams): ProjectManagerImportSourcesResult {
  if (sourceItems.length === 0) {
    throw new Error('project_manager import-sources requires at least one source item');
  }

  const { stdout, stderr } = runProjectManager(repoRoot, ['import-sources', projectPath, ...sourceItems]);

  return {
    stdout,
    stderr,
  };
}

export function runProjectManagerValidate({
  repoRoot,
  projectPath,
}: ProjectManagerProjectPathParams): ProjectManagerValidateResult {
  const { stdout, stderr } = runProjectManager(repoRoot, ['validate', projectPath]);

  return {
    stdout,
    stderr,
    isValid: /valid/i.test(`${stdout}\n${stderr}`),
  };
}

export function runProjectManagerInfo({
  repoRoot,
  projectPath,
}: ProjectManagerProjectPathParams): ProjectManagerInfoResult {
  return runProjectManager(repoRoot, ['info', projectPath]);
}
