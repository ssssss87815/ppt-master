import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runProjectManagerImportSources,
  runProjectManagerInfo,
  runProjectManagerInit,
  runProjectManagerValidate,
} from '../backend/adapter/project-manager-runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function removeIfExists(targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const projectName = `productization-validate-info-${Date.now()}`;
  const tempSourcePath = path.join(os.tmpdir(), `${projectName}.md`);

  let createdWorkspacePath: string | undefined;

  try {
    fs.writeFileSync(tempSourcePath, '# Validate info seed\n\nThis is a real validate/info bridge test.\n', 'utf8');

    const initResult = runProjectManagerInit({ repoRoot, projectName });
    createdWorkspacePath = initResult.createdWorkspacePath.startsWith('/')
      ? initResult.createdWorkspacePath
      : path.join(repoRoot, initResult.createdWorkspacePath);

    runProjectManagerImportSources({
      repoRoot,
      projectPath: createdWorkspacePath,
      sourceItems: [tempSourcePath],
    });

    const validateResult = runProjectManagerValidate({
      repoRoot,
      projectPath: createdWorkspacePath,
    });
    const infoResult = runProjectManagerInfo({
      repoRoot,
      projectPath: createdWorkspacePath,
    });

    const combinedInfo = `${infoResult.stdout}\n${infoResult.stderr}`;

    assert.ok(validateResult.isValid, 'validate should report a valid project');
    assert.match(validateResult.stdout + validateResult.stderr, /valid/i, 'validate output should mention valid state');
    assert.match(combinedInfo, /Project info:/i, 'info output should include project info heading');
    assert.match(combinedInfo, /Source count:/i, 'info output should include source count');
    assert.match(combinedInfo, /Canvas format:/i, 'info output should include canvas format');
    assert.match(combinedInfo, /Source materials:\s+Yes/i, 'info output should show imported source materials');

    console.log('project-manager validate/info runtime bridge test: ok');
  } finally {
    removeIfExists(tempSourcePath);
    if (createdWorkspacePath) {
      removeIfExists(createdWorkspacePath);
    }
  }
}

main();
