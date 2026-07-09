import type {
  ImportSourcesAction,
  PrepareConfirmationsAction,
  SubmitConfirmationsAction,
} from '../models/actions';
import type { ProductArtifactRef } from '../models/artifacts';
import type { ConfirmationRecommendation, SubmitConfirmationsPayload } from '../models/confirmations';
import type { ProjectRecord } from '../models/projects';

export type ProductActionResult = {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  nextStatus: ProjectRecord['status'];
};

export interface PptmasterRuntimeAdapter {
  createProject(action: Extract<import('../models/actions').ProductAction, { type: 'create_project' }>): Promise<ProductActionResult>;
  importSources(action: ImportSourcesAction): Promise<ProductActionResult>;
  prepareConfirmations(action: PrepareConfirmationsAction): Promise<ProductActionResult & {
    recommendations?: ConfirmationRecommendation[];
  }>;
  submitConfirmations(action: SubmitConfirmationsAction & {
    payload: SubmitConfirmationsPayload;
  }): Promise<ProductActionResult>;
  startGeneration(action: Extract<import('../models/actions').ProductAction, { type: 'start_generation' }>): Promise<ProductActionResult>;
  resumeGeneration(action: Extract<import('../models/actions').ProductAction, { type: 'resume_generation' }>): Promise<ProductActionResult>;
  requestRevision(action: Extract<import('../models/actions').ProductAction, { type: 'request_revision' }>): Promise<ProductActionResult>;
  exportPptx(action: Extract<import('../models/actions').ProductAction, { type: 'export_pptx' }>): Promise<ProductActionResult>;
}
