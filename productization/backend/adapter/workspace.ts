export const PRODUCTIZATION_WORKSPACE_ROOT = 'projects';

export type ProductWorkspaceBinding = {
  projectId: string;
  workspacePath: string;
};

export function toWorkspacePath(projectId: string): string {
  return `${PRODUCTIZATION_WORKSPACE_ROOT}/${projectId}`;
}

export function assertWorkspacePathBinding(binding: ProductWorkspaceBinding): ProductWorkspaceBinding {
  const expected = toWorkspacePath(binding.projectId);

  if (binding.workspacePath !== expected) {
    throw new Error(
      `Workspace binding mismatch for projectId=${binding.projectId}: expected ${expected}, got ${binding.workspacePath}`,
    );
  }

  return binding;
}
