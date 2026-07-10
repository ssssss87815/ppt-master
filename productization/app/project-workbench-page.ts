import type { ProductArtifactRef } from '../backend/models/artifacts';
import type { WorkflowCheckpoint, ProjectRecord } from '../backend/models/projects';
import type { ProjectRepository, CheckpointRepository } from '../backend/state/project-repository';
import type { ArtifactRepository } from '../backend/state/artifact-repository';
import { toProjectViewModel } from '../backend/services/project-view-service';
import type { ProjectViewModel } from './viewmodels/project-view-model';
import { renderProjectWorkbenchShell } from './render-project-workbench-shell';

export type ProjectWorkbenchPageDependencies = {
  projects: Pick<ProjectRepository, 'getById'> & Partial<Pick<ProjectRepository, 'update'>>;
  artifacts: Pick<ArtifactRepository, 'listByProjectId'> & Partial<Pick<ArtifactRepository, 'createMany'>>;
  checkpoints: Pick<CheckpointRepository, 'listByProjectId' | 'getLatestByProjectId'> & Partial<Pick<CheckpointRepository, 'create'>>;
  loadRecommendations?: (projectId: string) => Promise<Array<{ key: string; title: string; recommendation: string }>>;
};

export type ProjectWorkbenchPageResult =
  | {
      status: 200;
      contentType: 'text/html; charset=utf-8';
      project: ProjectRecord;
      viewModel: ProjectViewModel;
      body: string;
    }
  | {
      status: 500;
      contentType: 'text/html; charset=utf-8';
      body: string;
    }
  | {
      status: 404;
      contentType: 'text/html; charset=utf-8';
      body: string;
    };

function sortCheckpointsDescending(checkpoints: WorkflowCheckpoint[]): WorkflowCheckpoint[] {
  return [...checkpoints].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function resolveLatestStartedCheckpoint(checkpoints: WorkflowCheckpoint[]): WorkflowCheckpoint | undefined {
  const sorted = sortCheckpointsDescending(checkpoints);
  for (const checkpoint of sorted) {
    if (checkpoint.status === 'started') {
      return checkpoint;
    }
  }

  return undefined;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

function renderProjectNotFoundPage(projectId: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Project not found · PPT Productization Workbench</title>
  </head>
  <body>
    <main data-status="not_found" data-project-id="${escapeHtml(projectId)}" aria-labelledby="project-not-found-title">
      <header>
        <p class="project-status">not_found</p>
        <h1 id="project-not-found-title">Project workbench unavailable</h1>
      </header>
      <p>No productization project exists for <code>${escapeHtml(projectId)}</code>.</p>
    </main>
  </body>
</html>`;
}

function renderProjectUnavailablePage(projectId: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Project unavailable · PPT Productization Workbench</title>
  </head>
  <body>
    <main data-status="unavailable" data-project-id="${escapeHtml(projectId)}" aria-labelledby="project-unavailable-title">
      <header>
        <p class="project-status">unavailable</p>
        <h1 id="project-unavailable-title">Project workbench temporarily unavailable</h1>
      </header>
      <p>The project workspace could not be loaded. Retry once the local productization services are available.</p>
    </main>
  </body>
</html>`;
}

async function loadProjectArtifacts(
  artifacts: Pick<ArtifactRepository, 'listByProjectId'>,
  projectId: string,
): Promise<ProductArtifactRef[]> {
  return artifacts.listByProjectId(projectId);
}

export async function renderProjectWorkbenchPage(
  dependencies: ProjectWorkbenchPageDependencies,
  projectId: string,
): Promise<ProjectWorkbenchPageResult> {
  let project: ProjectRecord | null;
  try {
    project = await dependencies.projects.getById(projectId);
  } catch {
    return {
      status: 500,
      contentType: 'text/html; charset=utf-8',
      body: renderProjectUnavailablePage(projectId),
    };
  }

  if (!project) {
    return {
      status: 404,
      contentType: 'text/html; charset=utf-8',
      body: renderProjectNotFoundPage(projectId),
    };
  }

  let artifacts: ProductArtifactRef[];
  let recommendations: Array<{ key: string; title: string; recommendation: string }>;
  let latestCheckpoint: WorkflowCheckpoint | null;
  let checkpoints: WorkflowCheckpoint[];

  try {
    [artifacts, recommendations, latestCheckpoint, checkpoints] = await Promise.all([
      loadProjectArtifacts(dependencies.artifacts, project.projectId),
      dependencies.loadRecommendations?.(project.projectId) ?? Promise.resolve([]),
      dependencies.checkpoints.getLatestByProjectId(project.projectId),
      dependencies.checkpoints.listByProjectId(project.projectId),
    ]);
  } catch {
    return {
      status: 500,
      contentType: 'text/html; charset=utf-8',
      body: renderProjectUnavailablePage(projectId),
    };
  }

  const latestStartedCheckpoint = resolveLatestStartedCheckpoint(checkpoints);
  const viewModel = toProjectViewModel(
    project,
    artifacts,
    recommendations,
    latestCheckpoint ?? undefined,
    latestStartedCheckpoint,
  ) as unknown as ProjectViewModel;

  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    project,
    viewModel,
    body: renderProjectWorkbenchShell(viewModel),
  };
}
