import type { ImportSourcesAction } from '../models/actions';
import type { ProductArtifactRef } from '../models/artifacts';
import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';
import { attachCheckpoint, stubImportSourceArtifacts, toWorkflowCheckpoint } from '../adapter/pptmaster-adapter';

export function applyImportSources(
  project: ProjectRecord,
  action: ImportSourcesAction,
  now = new Date().toISOString(),
): {
  project: ProjectRecord;
  artifacts: ProductArtifactRef[];
  checkpoint: WorkflowCheckpoint;
} {
  const artifacts = stubImportSourceArtifacts({
    project,
    sources: action.payload.sources,
    now,
  });

  const nextProject: ProjectRecord = {
    ...project,
    status: 'sources_ready',
    updatedAt: now,
  };

  const checkpoint = toWorkflowCheckpoint(
    nextProject,
    'sources_imported',
    project.status,
    'sources_ready',
    artifacts.map((item) => item.artifactId),
    now,
  );
  const attached = attachCheckpoint(nextProject, checkpoint, artifacts, now);

  return {
    project: attached.project,
    artifacts: attached.artifacts,
    checkpoint,
  };
}
