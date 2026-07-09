import type { CreateProjectAction } from '../models/actions';
import type { PptmasterRuntimeAdapter } from '../adapter/interface';

export async function handleCreateProject(
  adapter: PptmasterRuntimeAdapter,
  action: CreateProjectAction,
) {
  return adapter.createProject(action);
}
