import assert from 'node:assert/strict';

import { createProjectRecord } from '../backend/actions/create-project-record';
import type { CreateProjectAction } from '../backend/models/actions';
import type { ProjectRecord } from '../backend/models/projects';
import type { ProjectRepository } from '../backend/state/project-repository';

class InMemoryProjectRepository implements ProjectRepository {
  private readonly items = new Map<string, ProjectRecord>();

  async create(project: ProjectRecord): Promise<ProjectRecord> {
    this.items.set(project.projectId, project);
    return project;
  }

  async update(project: ProjectRecord): Promise<ProjectRecord> {
    this.items.set(project.projectId, project);
    return project;
  }

  async getById(projectId: string): Promise<ProjectRecord | null> {
    return this.items.get(projectId) ?? null;
  }

  async list(): Promise<ProjectRecord[]> {
    return [...this.items.values()];
  }
}

async function main() {
  const repository = new InMemoryProjectRepository();
  const action: CreateProjectAction = {
    type: 'create_project',
    payload: {
      name: 'PPTMASTER Demo Project',
    },
  };

  const project = await createProjectRecord(repository, action, '2026-06-30T16:00:00.000Z');

  assert.equal(project.projectId, 'pptmaster-demo-project');
  assert.equal(project.status, 'draft');
  assert.equal(project.workspace.workspacePath, 'projects/pptmaster-demo-project');

  console.log('create-project-record test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
