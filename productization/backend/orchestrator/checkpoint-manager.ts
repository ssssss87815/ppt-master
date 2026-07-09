import type { WorkflowCheckpoint } from '../models/projects';

export type CheckpointManager = {
  start(params: {
    projectId: string;
    stage: WorkflowCheckpoint['stage'];
    statusBefore: WorkflowCheckpoint['statusBefore'];
    createdAt?: string;
    note?: string;
  }): WorkflowCheckpoint;
  complete(params: {
    projectId: string;
    stage: WorkflowCheckpoint['stage'];
    statusBefore: WorkflowCheckpoint['statusBefore'];
    statusAfter: WorkflowCheckpoint['statusAfter'];
    artifactIds?: string[];
    createdAt?: string;
    note?: string;
  }): WorkflowCheckpoint;
  fail(params: {
    projectId: string;
    stage: WorkflowCheckpoint['stage'];
    statusBefore: WorkflowCheckpoint['statusBefore'];
    statusAfter?: WorkflowCheckpoint['statusAfter'];
    artifactIds?: string[];
    createdAt?: string;
    note?: string;
  }): WorkflowCheckpoint;
};

export function createCheckpointManager(): CheckpointManager {
  return {
    start({ projectId, stage, statusBefore, createdAt = new Date().toISOString(), note }) {
      return {
        checkpointId: `${projectId}-${stage}-started-${Date.parse(createdAt)}`,
        projectId,
        stage,
        status: 'started',
        statusBefore,
        statusAfter: statusBefore,
        artifactIds: [],
        note,
        createdAt,
      };
    },
    complete({ projectId, stage, statusBefore, statusAfter, artifactIds = [], createdAt = new Date().toISOString(), note }) {
      return {
        checkpointId: `${projectId}-${stage}-completed-${Date.parse(createdAt)}`,
        projectId,
        stage,
        status: 'completed',
        statusBefore,
        statusAfter,
        artifactIds,
        note,
        createdAt,
      };
    },
    fail({ projectId, stage, statusBefore, statusAfter = 'failed_recoverable', artifactIds = [], createdAt = new Date().toISOString(), note }) {
      return {
        checkpointId: `${projectId}-${stage}-failed-${Date.parse(createdAt)}`,
        projectId,
        stage,
        status: 'failed',
        statusBefore,
        statusAfter,
        artifactIds,
        note,
        createdAt,
      };
    },
  };
}
