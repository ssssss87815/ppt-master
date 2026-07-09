import fs from 'node:fs';
import path from 'node:path';

import type { ConfirmationRecommendation, SubmitConfirmationsPayload } from '../models/confirmations';

export type ConfirmationFileBridgeBaseParams = {
  projectPath: string;
};

export type WriteRecommendationsParams = ConfirmationFileBridgeBaseParams & {
  recommendations: ConfirmationRecommendation[];
};

export type WriteConfirmationResultParams = ConfirmationFileBridgeBaseParams & {
  payload: SubmitConfirmationsPayload;
};

export type ConfirmationFileWriteResult = {
  filePath: string;
};

const CONFIRM_DIR = 'confirmations';
const RECOMMENDATIONS_FILE = 'recommendations.json';
const RESULT_FILE = 'result.json';

function ensureConfirmDir(projectPath: string): string {
  const confirmDir = path.join(projectPath, CONFIRM_DIR);
  fs.mkdirSync(confirmDir, { recursive: true });
  return confirmDir;
}

export function writeConfirmationRecommendationsFile({
  projectPath,
  recommendations,
}: WriteRecommendationsParams): ConfirmationFileWriteResult {
  const confirmDir = ensureConfirmDir(projectPath);
  const filePath = path.join(confirmDir, RECOMMENDATIONS_FILE);
  fs.writeFileSync(filePath, JSON.stringify(recommendations, null, 2), 'utf8');
  return { filePath };
}

export function writeConfirmationResultFile({
  projectPath,
  payload,
}: WriteConfirmationResultParams): ConfirmationFileWriteResult {
  const confirmDir = ensureConfirmDir(projectPath);
  const filePath = path.join(confirmDir, RESULT_FILE);
  const result = {
    ...payload,
    status: 'confirmed',
    confirmed_at: payload.lockedAt ?? new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
  return { filePath };
}
