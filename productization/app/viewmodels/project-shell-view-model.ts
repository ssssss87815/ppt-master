import type { ConfirmationSubmissionViewModel } from './confirmation-submission-view-model';
import type { ProjectWorkbenchSectionViewModel, ProjectViewModel } from './project-view-model';
import type { PreviewViewModel } from './preview-view-model';
import type { ExportViewModel } from './export-view-model';

export type ProjectShellConfirmationSubmissionViewModel = Omit<ConfirmationSubmissionViewModel, 'questions'> & {
  submitAction?: NonNullable<ProjectViewModel['workbench']['confirmationSubmission']>['submitAction'];
  completionLabel: string;
  questions: Array<ConfirmationSubmissionViewModel['questions'][number] & {
    placeholder: string;
  }>;
};

export type ProjectShellConfirmationSectionViewModel = {
  key: ProjectWorkbenchSectionViewModel['key'];
  title: string;
  status: ProjectWorkbenchSectionViewModel['status'];
  summary: string;
  action?: ProjectWorkbenchSectionViewModel['action'];
  submission?: ProjectShellConfirmationSubmissionViewModel;
};

export type ProjectShellPreviewSectionViewModel = {
  latestPreviewUrl?: string;
  manifestStorageKey?: string;
  pageCount?: number;
  pageArtifactIds?: string[];
  items?: Array<PreviewViewModel['items'][number]>;
};

export type ProjectShellExportSectionViewModel = {
  latestExportUrl?: string;
  latestExportLabel?: ExportViewModel['latestExportLabel'];
  format?: ExportViewModel['format'];
  filename?: ExportViewModel['filename'];
  companionArtifactIds?: ExportViewModel['companionArtifactIds'];
  companionStorageKeys?: string[];
  assetDirectoryStorageKey?: ExportViewModel['assetDirectoryStorageKey'];
  runId?: ExportViewModel['runId'];
  artifactCount?: ExportViewModel['artifactCount'];
  companionCount?: ExportViewModel['companionCount'];
};

export type ProjectShellDeliverySectionViewModel = {
  primaryArtifactId?: string;
  primaryStorageKey?: string;
  primaryLabel?: NonNullable<ProjectViewModel['delivery']>['primaryLabel'];
  companionArtifactIds?: string[];
  companionStorageKeys?: string[];
  assetDirectoryStorageKey?: NonNullable<ProjectViewModel['delivery']>['assetDirectoryStorageKey'];
  runId?: NonNullable<ProjectViewModel['delivery']>['runId'];
  items?: NonNullable<ProjectViewModel['delivery']>['items'];
};

export type ProjectShellViewModel = {
  projectId: string;
  name: string;
  status: ProjectViewModel['status'];
  confirmationSection: ProjectShellConfirmationSectionViewModel;
  preview?: ProjectShellPreviewSectionViewModel;
  export?: ProjectShellExportSectionViewModel;
  delivery?: ProjectShellDeliverySectionViewModel;
};

function formatCompletionLabel(submission: ConfirmationSubmissionViewModel): string {
  return `${submission.completion.completedCount}/${submission.completion.totalCount} answered`;
}

export function toProjectShellViewModel(project: ProjectViewModel): ProjectShellViewModel {
  const confirmationSection = project.workbench.sections.find((section) => section.key === 'confirmations');
  const submission = project.workbench.confirmationSubmission;

  if (!confirmationSection) {
    throw new Error('Project workbench missing confirmations section.');
  }

  return {
    projectId: project.projectId,
    name: project.name,
    status: project.status,
    confirmationSection: {
      key: confirmationSection.key,
      title: confirmationSection.title,
      status: confirmationSection.status,
      summary: confirmationSection.summary,
      action: confirmationSection.action,
      submission:
        submission && submission.status !== 'not_ready'
          ? {
              ...submission,
              submitAction: submission.submitAction,
              completionLabel: formatCompletionLabel(submission),
              questions: submission.questions.map((question) => ({
                ...question,
                placeholder: question.input.placeholder,
              })),
            }
          : undefined,
    },
    preview: project.preview
      ? {
          latestPreviewUrl: project.preview.latestPreviewUrl,
          manifestStorageKey: project.preview.manifestStorageKey,
          pageCount: project.preview.pageCount,
          pageArtifactIds: project.preview.pageArtifactIds,
          items: project.preview.items,
        }
      : undefined,
    export: project.export
      ? {
          latestExportUrl: project.export.latestExportUrl,
          latestExportLabel: project.export.latestExportLabel,
          format: project.export.format,
          filename: project.export.filename,
          companionArtifactIds: project.export.companionArtifactIds,
          companionStorageKeys: project.export.companionStorageKeys,
          assetDirectoryStorageKey: project.export.assetDirectoryStorageKey,
          runId: project.export.runId,
          artifactCount: project.export.artifactCount,
          companionCount: project.export.companionCount,
        }
      : undefined,
    delivery: project.delivery
      ? {
          primaryArtifactId: project.delivery.primaryArtifactId,
          primaryStorageKey: project.delivery.primaryStorageKey,
          primaryLabel: project.delivery.primaryLabel,
          companionArtifactIds: project.delivery.companionArtifactIds,
          companionStorageKeys: project.delivery.companionStorageKeys,
          assetDirectoryStorageKey: project.delivery.assetDirectoryStorageKey,
          runId: project.delivery.runId,
          items: project.delivery.items,
        }
      : undefined,
  };
}
