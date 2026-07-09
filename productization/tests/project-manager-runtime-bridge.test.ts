import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runProjectManagerInit } from '../backend/adapter/project-manager-runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function removeIfExists(targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const projectName = `productization-runtime-bridge-${Date.now()}`;

  let createdWorkspacePath: string | undefined;

  try {
    const result = runProjectManagerInit({
      repoRoot,
      projectName,
    });

    createdWorkspacePath = result.createdWorkspacePath.startsWith('/')
      ? result.createdWorkspacePath
      : path.join(repoRoot, result.createdWorkspacePath);

    assert.ok(fs.existsSync(createdWorkspacePath), 'project_manager init should create a real workspace directory');
    assert.ok(fs.existsSync(path.join(createdWorkspacePath, 'README.md')), 'workspace should contain README.md');
    assert.match(result.createdWorkspacePath, /projects\//, 'workspace path should stay under projects/');

    console.log('project-manager runtime bridge test: ok');
  } finally {
    if (createdWorkspacePath) {
      removeIfExists(createdWorkspacePath);
    }
  }
}

main();
