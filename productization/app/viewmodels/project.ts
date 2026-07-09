import type { ProductArtifactRef } from '../../backend/models/artifacts';
import type { ProjectStatus } from '../../backend/state/schema';

export type SourceItemViewModel = {
  sourceId: string;
  label: string;
  kind: 'file' | 'url' | 'text';
  status: 'uploaded' | 'normalized' | 'failed';
};

export type ConfirmationQuestionViewModel = {
  key: string;
  title: string;
  recommendation?: string;
  answer?: unknown;
};

export type ProductProjectViewModel = {
  projectId: string;
  name: string;
  status: ProjectStatus;
  sources: SourceItemViewModel[];
  confirmations: ConfirmationQuestionViewModel[];
  artifacts: Array<Pick<ProductArtifactRef, 'artifactId' | 'kind' | 'status' | 'label'>>;
  lastUpdatedAt: string;
};
