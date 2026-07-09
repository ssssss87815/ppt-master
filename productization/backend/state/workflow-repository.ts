import type { WorkflowCheckpoint } from '../models/projects';

export interface WorkflowRepository {
  listByProjectId(projectId: string): Promise<WorkflowCheckpoint[]>;
  append(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint>;
}
