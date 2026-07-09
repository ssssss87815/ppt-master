import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  writeConfirmationRecommendationsFile,
  writeConfirmationResultFile,
} from '../backend/adapter/confirmation-file-bridge';
import type { ConfirmationRecommendation, SubmitConfirmationsPayload } from '../backend/models/confirmations';

function removeIfExists(targetPath: string) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function main() {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pptmaster-confirm-bridge-'));

  try {
    const recommendations: ConfirmationRecommendation[] = [
      { key: 'audience', title: 'Audience', recommendation: 'Founders and seed investors' },
      { key: 'goal', title: 'Goal', recommendation: 'Secure follow-up partner meeting' },
      { key: 'tone', title: 'Tone', recommendation: 'Confident and crisp' },
      { key: 'language', title: 'Language', recommendation: 'zh-CN' },
      { key: 'brand', title: 'Brand', recommendation: 'PPTMASTER' },
      { key: 'outline', title: 'Outline', recommendation: 'problem-solution-proof-ask' },
      { key: 'visual_style', title: 'Visual Style', recommendation: 'minimal dark' },
      { key: 'delivery', title: 'Delivery', recommendation: 'live pitch' },
    ];

    const payload: SubmitConfirmationsPayload = {
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
    };

    const recommendationResult = writeConfirmationRecommendationsFile({
      projectPath,
      recommendations,
    });
    const confirmationResult = writeConfirmationResultFile({
      projectPath,
      payload,
    });

    const recommendationJson = JSON.parse(fs.readFileSync(recommendationResult.filePath, 'utf8'));
    const confirmationJson = JSON.parse(fs.readFileSync(confirmationResult.filePath, 'utf8'));

    assert.equal(path.basename(recommendationResult.filePath), 'recommendations.json');
    assert.equal(path.basename(confirmationResult.filePath), 'result.json');
    assert.equal(recommendationJson.length, 8);
    assert.equal(recommendationJson[0].key, 'audience');
    assert.equal(confirmationJson.status, 'confirmed');
    assert.equal(confirmationJson.confirmed_at, '2026-07-07T12:00:00.000Z');
    assert.equal(confirmationJson.answers.goal, 'Secure follow-up partner meeting');

    console.log('confirmation file bridge test: ok');
  } finally {
    removeIfExists(projectPath);
  }
}

main();
