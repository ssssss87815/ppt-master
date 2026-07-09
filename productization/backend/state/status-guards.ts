import type { ProjectStatus } from './schema';

const ORDERED_STATUSES: ProjectStatus[] = [
  'draft',
  'sources_ready',
  'confirmation_pending',
  'confirmation_locked',
  'spec_ready',
  'generation_in_progress',
  'preview_available',
  'revision_requested',
  'export_ready',
  'failed_recoverable',
];

export function assertProjectStatus(
  actual: ProjectStatus,
  expected: ProjectStatus,
  caller: string,
): void {
  if (actual !== expected) {
    throw new Error(`${caller}: expected project status ${expected}, got ${actual}`);
  }
}

export function isStatusAtLeast(actual: ProjectStatus, minimum: ProjectStatus): boolean {
  return ORDERED_STATUSES.indexOf(actual) >= ORDERED_STATUSES.indexOf(minimum);
}

export function isFailureStatus(status: ProjectStatus): boolean {
  return status === 'failed_recoverable';
}
