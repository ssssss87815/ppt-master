import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  writeConfirmationRecommendationsFile,
  writeConfirmationResultFile,
} from '../backend/adapter/confirmation-file-bridge';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function removeIfExists(targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

async function main() {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pptmaster-confirm-ui-'));
  const port = 5167;
  const baseUrl = `http://127.0.0.1:${port}`;

  const recommendations = [
    { key: 'audience', title: 'Audience', recommendation: 'Founders and seed investors' },
    { key: 'goal', title: 'Goal', recommendation: 'Secure follow-up partner meeting' },
    { key: 'tone', title: 'Tone', recommendation: 'Confident and crisp' },
    { key: 'language', title: 'Language', recommendation: 'zh-CN' },
    { key: 'brand', title: 'Brand', recommendation: 'PPTMASTER' },
    { key: 'outline', title: 'Outline', recommendation: 'problem-solution-proof-ask' },
    { key: 'visual_style', title: 'Visual Style', recommendation: 'minimal dark' },
    { key: 'delivery', title: 'Delivery', recommendation: 'live pitch' },
  ];

  try {
    writeConfirmationRecommendationsFile({ projectPath, recommendations });
    writeConfirmationResultFile({
      projectPath,
      payload: {
        answers: {
          audience: 'Founders and seed investors',
          goal: 'Secure follow-up partner meeting',
          tone: 'Confident and crisp',
          language: 'zh-CN',
          brand: 'PPTMASTER',
          outline: 'problem-solution-proof-ask',
          visual_style: 'minimal dark',
          delivery: 'live pitch',
        },
        lockedAt: '2026-07-07T12:00:00.000Z',
      },
    });

    const proc = spawn(
      'python3',
      [
        'skills/ppt-master/scripts/confirm_ui/server.py',
        projectPath,
        '--port',
        String(port),
        '--timeout',
        '30',
        '--no-browser',
      ],
      {
        cwd: path.resolve(__dirname, '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    try {
      let ready = false;
      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const response = await fetch(`${baseUrl}/api/recommendations`);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {}
      }

      assert.ok(ready, 'confirm_ui server should become reachable');

      const response = await fetch(`${baseUrl}/api/recommendations`);
      assert.equal(response.status, 200);
      const data = await response.json();

      assert.equal(Array.isArray(data.recommendations ?? data), true);
      const entries = Array.isArray(data) ? data : data.recommendations;
      assert.equal(entries.length, 8);
      assert.equal(entries[0].key, 'audience');
      assert.equal(data._already_confirmed ?? true, true);

      console.log('confirm-ui smoke bridge test: ok');
    } finally {
      proc.kill('SIGTERM');
      await new Promise((resolve) => proc.once('exit', resolve));
    }
  } finally {
    removeIfExists(projectPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
