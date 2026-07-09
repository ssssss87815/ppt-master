import assert from 'node:assert/strict';

import {
  validateSubmitConfirmationsPayload,
  type SubmitConfirmationsPayload,
} from '../backend/models/confirmations';

function main() {
  const valid: SubmitConfirmationsPayload = {
    answers: {
      audience: 'Founders',
      goal: 'Raise seed round',
      tone: 'Confident',
      language: 'zh-CN',
      brand: 'PPTMASTER',
      outline: 'problem-solution-traction',
      visual_style: 'minimal dark',
      delivery: 'live pitch',
    },
  };

  const invalid: SubmitConfirmationsPayload = {
    answers: {
      audience: 'Founders',
      goal: '',
      tone: 'Confident',
      language: 'zh-CN',
      brand: 'PPTMASTER',
      outline: 'problem-solution-traction',
      visual_style: 'minimal dark',
      delivery: 'live pitch',
    },
  };

  assert.equal(validateSubmitConfirmationsPayload(valid), true);
  assert.equal(validateSubmitConfirmationsPayload(invalid), false);

  console.log('submit-confirmations validation test: ok');
}

main();
