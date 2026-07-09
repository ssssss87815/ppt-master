import type { WorkflowCheckpoint } from '../models/projects';

export interface CheckpointRepository {
  create(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint>;
  getLatestByProjectId(projectId: string): Promise<WorkflowCheckpoint | null>;
  listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]>;
}
