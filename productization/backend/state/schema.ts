export type ProjectStatus =
  | 'draft'
  | 'sources_ready'
  | 'confirmation_pending'
  | 'confirmation_locked'
  | 'spec_ready'
  | 'generation_in_progress'
  | 'preview_available'
  | 'revision_requested'
  | 'export_ready'
  | 'failed_recoverable';

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  'draft',
  'sources_ready',
  'confirmation_pending',
  'confirmation_locked',
  'spec_ready',
  'generation_in_progress',
  'preview_available',
  'revision_requested',
  'export_ready',
  'failed_recoverable',
];

export const PROJECT_STATUS_DESCRIPTIONS: Record<ProjectStatus, string> = {
  draft: 'Project record exists and workspace is reserved, but no imported sources are locked yet.',
  sources_ready: 'At least one source has been imported and normalized into product-visible source artifacts.',
  confirmation_pending: 'The system prepared confirmation recommendations and is waiting for user submission.',
  confirmation_locked: 'Eight Confirmations have been submitted and locked as the generation entry contract.',
  spec_ready: 'Strategist outputs are materialized as product-visible design_spec and spec_lock artifacts, ready to gate generation entry.',
  generation_in_progress: 'Internal runtime orchestration is currently producing generation outputs.',
  preview_available: 'At least one preview artifact is available for product consumption.',
  revision_requested: 'A generated result exists, but the user requested a revision before export.',
  export_ready: 'Exportable artifacts exist and are ready for delivery.',
  failed_recoverable: 'The workflow stopped with a recoverable failure and can be resumed or retried.',
};

export const PROJECT_STATUS_ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['sources_ready', 'failed_recoverable'],
  sources_ready: ['confirmation_pending', 'failed_recoverable'],
  confirmation_pending: ['confirmation_locked', 'failed_recoverable'],
  confirmation_locked: ['spec_ready', 'failed_recoverable'],
  spec_ready: ['generation_in_progress', 'failed_recoverable'],
  generation_in_progress: ['preview_available', 'failed_recoverable'],
  preview_available: ['revision_requested', 'export_ready', 'failed_recoverable'],
  revision_requested: ['generation_in_progress', 'failed_recoverable'],
  export_ready: ['failed_recoverable'],
  failed_recoverable: ['draft', 'sources_ready', 'confirmation_pending', 'confirmation_locked', 'spec_ready', 'generation_in_progress', 'preview_available', 'revision_requested', 'export_ready'],
};
