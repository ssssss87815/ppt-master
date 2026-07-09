export const REQUIRED_CONFIRMATION_KEYS = [
  'audience',
  'goal',
  'tone',
  'language',
  'brand',
  'outline',
  'visual_style',
  'delivery',
] as const;

export type ConfirmationKey = (typeof REQUIRED_CONFIRMATION_KEYS)[number];

export type ConfirmationAnswerMap = Record<ConfirmationKey, string>;

export type ConfirmationRecommendation = {
  key: ConfirmationKey;
  title: string;
  recommendation: string;
};

export type SubmitConfirmationsPayload = {
  answers: Partial<Record<ConfirmationKey, string>>;
  lockedAt?: string;
};

export function validateSubmitConfirmationsPayload(
  payload: SubmitConfirmationsPayload,
): payload is { answers: ConfirmationAnswerMap; lockedAt?: string } {
  if (!payload || typeof payload !== 'object' || !payload.answers) {
    return false;
  }

  return REQUIRED_CONFIRMATION_KEYS.every((key) => {
    const value = payload.answers[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}
