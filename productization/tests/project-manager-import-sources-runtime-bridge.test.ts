import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runProjectManagerImportSources, runProjectManagerInit } from '../backend/adapter/project-manager-runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function removeIfExists(targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const projectName = `productization-import-bridge-${Date.now()}`;
  const tempSourcePath = path.join(os.tmpdir(), `${projectName}.md`);

  let createdWorkspacePath: string | undefined;

  try {
    fs.writeFileSync(tempSourcePath, '# Seed memo\n\nThis is a real import-sources bridge test.\n', 'utf8');

    const initResult = runProjectManagerInit({
      repoRoot,
      projectName,
    });

    createdWorkspacePath = initResult.createdWorkspacePath.startsWith('/')
      ? initResult.createdWorkspacePath
      : path.join(repoRoot, initResult.createdWorkspacePath);

    const importResult = runProjectManagerImportSources({
      repoRoot,
      projectPath: createdWorkspacePath,
      sourceItems: [tempSourcePath],
    });

    const importedMarkdownPath = path.join(createdWorkspacePath, 'sources', path.basename(tempSourcePath));

    assert.ok(fs.existsSync(createdWorkspacePath), 'project workspace should exist before import');
    assert.ok(fs.existsSync(importedMarkdownPath), 'import-sources should copy markdown into project sources/');
    assert.match(importResult.stdout + importResult.stderr, /imported|markdown|sources/i, 'import-sources output should mention import activity');

    console.log('project-manager import-sources runtime bridge test: ok');
  } finally {
    removeIfExists(tempSourcePath);
    if (createdWorkspacePath) {
      removeIfExists(createdWorkspacePath);
    }
  }
}

main();
