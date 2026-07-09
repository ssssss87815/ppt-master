import type { CreateProjectAction } from '../models/actions';
import type { ProjectRecord } from '../models/projects';
import type { ProjectRepository } from '../state/project-repository';
import { toWorkspacePath } from '../adapter/workspace';

function toProjectId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

export async function createProjectRecord(
  repository: ProjectRepository,
  action: CreateProjectAction,
  now = new Date().toISOString(),
): Promise<ProjectRecord> {
  const inferredProjectId = toProjectId(action.payload.name);
  const projectId = action.payload.projectId && action.payload.projectId.trim()
    ? action.payload.projectId.trim()
    : inferredProjectId;

  const project: ProjectRecord = {
    projectId,
    name: action.payload.name,
    status: 'draft',
    workspace: {
      projectId,
      workspacePath: toWorkspacePath(projectId),
    },
    createdAt: now,
    updatedAt: now,
  };

  return repository.create(project);
}
