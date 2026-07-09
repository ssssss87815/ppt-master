import type { ConfirmationRecommendation } from '../../backend/models/confirmations';

export type ConfirmationViewModel = {
  key: ConfirmationRecommendation['key'];
  title: string;
  recommendation: string;
  answer?: string;
};
