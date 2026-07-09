import type { ProjectStatus } from '../state/schema';

export type CreateProjectAction = {
  type: 'create_project';
  payload: {
    projectId?: string;
    name: string;
    canvas?: string;
  };
};

export type ImportSourcesAction = {
  type: 'import_sources';
  payload: {
    projectId: string;
    sources: Array<{
      kind: 'file' | 'url' | 'text';
      value: string;
      label?: string;
    }>;
  };
};

export type PrepareConfirmationsAction = {
  type: 'prepare_confirmations';
  payload: {
    projectId: string;
  };
};

export type SubmitConfirmationsAction = {
  type: 'submit_confirmations';
  payload: {
    projectId: string;
    confirmationSetId?: string;
    answers: Record<string, unknown>;
  };
};

export type StartGenerationAction = {
  type: 'start_generation';
  payload: {
    projectId: string;
  };
};

export type ResumeGenerationAction = {
  type: 'resume_generation';
  payload: {
    projectId: string;
    fromStatus?: ProjectStatus;
  };
};

export type RequestRevisionAction = {
  type: 'request_revision';
  payload: {
    projectId: string;
    note: string;
  };
};

export type ExportPptxAction = {
  type: 'export_pptx';
  payload: {
    projectId: string;
    format?: 'pptx';
  };
};

export type ProductAction =
  | CreateProjectAction
  | ImportSourcesAction
  | PrepareConfirmationsAction
  | SubmitConfirmationsAction
  | StartGenerationAction
  | ResumeGenerationAction
  | RequestRevisionAction
  | ExportPptxAction;
