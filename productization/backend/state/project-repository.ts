import type { ProjectRecord, WorkflowCheckpoint } from '../models/projects';

export interface ProjectRepository {
  create(project: ProjectRecord): Promise<ProjectRecord>;
  update(project: ProjectRecord): Promise<ProjectRecord>;
  getById(projectId: string): Promise<ProjectRecord | null>;
  list(): Promise<ProjectRecord[]>;
}

export interface CheckpointRepository {
  create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint>;
  listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]>;
  getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null>;
}
