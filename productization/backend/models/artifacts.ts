export type ProductArtifactKind =
  | 'source_original'
  | 'source_normalized'
  | 'source_profile'
  | 'confirmation_recommendations'
  | 'confirmation_result'
  | 'workflow_checkpoint'
  | 'design_spec'
  | 'spec_lock'
  | 'image_manifest'
  | 'preview_page_svg'
  | 'preview_bundle'
  | 'quality_report'
  | 'final_page_svg'
  | 'final_bundle'
  | 'post_processing_report'
  | 'export_pptx'
  | 'runtime_log';

export type ProductArtifactScope = 'project' | 'source' | 'page' | 'run';

export type ProductArtifactStatus =
  | 'planned'
  | 'pending'
  | 'ready'
  | 'locked'
  | 'superseded'
  | 'failed';

export type ProductArtifactRef = {
  artifactId: string;
  projectId: string;
  kind: ProductArtifactKind;
  scope: ProductArtifactScope;
  status: ProductArtifactStatus;
  label?: string;
  sourceId?: string;
  pageKey?: string;
  runId?: string;
  storageKey: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export const SLICE_1_REQUIRED_ARTIFACT_KINDS: ProductArtifactKind[] = [
  'source_original',
  'source_normalized',
  'source_profile',
  'confirmation_recommendations',
  'confirmation_result',
  'workflow_checkpoint',
  'design_spec',
  'spec_lock',
];
