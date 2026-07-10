import type { ConfirmationKey, ConfirmationRecommendation } from '../../backend/models/confirmations';

export type ConfirmationSubmissionQuestionViewModel = {
  key: ConfirmationKey;
  title: string;
  recommendation: string;
  answer: string;
  isAnswered: boolean;
  input: {
    kind: 'textarea';
    placeholder: string;
  };
};

export type ConfirmationSubmissionViewModel = {
  projectId: string;
  status: 'not_ready' | 'ready' | 'submitted';
  bannerTone: 'neutral' | 'active' | 'success';
  bannerText: string;
  completion: {
    completedCount: number;
    totalCount: number;
    isComplete: boolean;
  };
  questions: ConfirmationSubmissionQuestionViewModel[];
  submitAction: {
    type: 'submit_confirmations';
    projectId: string;
  };
};

const DEFAULT_PLACEHOLDERS: Record<ConfirmationKey, string> = {
  audience: 'Who is the primary audience for this deck?',
  goal: 'What is the single presentation outcome that matters most?',
  tone: 'What tone should the presenter keep throughout the deck?',
  language: 'Which language should the generated deck use?',
  brand: 'Which product, company, or initiative name must stay consistent?',
  outline: 'What story spine or outline should the deck follow?',
  visual_style: 'What visual direction should the deck keep?',
  delivery: 'How will this deck be delivered or consumed?',
};

const QUESTION_TITLES: Record<ConfirmationKey, string> = {
  audience: 'Primary audience',
  goal: 'Presentation goal',
  tone: 'Presentation tone',
  language: 'Deck language',
  brand: 'Brand constraints',
  outline: 'Narrative outline',
  visual_style: 'Visual style',
  delivery: 'Delivery mode',
};

export function toConfirmationSubmissionQuestionViewModel(
  recommendation: ConfirmationRecommendation,
  answer?: string,
): ConfirmationSubmissionQuestionViewModel {
  const normalizedAnswer = typeof answer === 'string' ? answer.trim() : '';

  return {
    key: recommendation.key,
    title: QUESTION_TITLES[recommendation.key],
    recommendation: recommendation.recommendation,
    answer: normalizedAnswer,
    isAnswered: normalizedAnswer.length > 0,
    input: {
      kind: 'textarea',
      placeholder: DEFAULT_PLACEHOLDERS[recommendation.key],
    },
  };
}
