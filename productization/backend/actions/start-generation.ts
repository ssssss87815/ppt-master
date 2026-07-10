import type {
  ResumeGenerationAction,
  StartGenerationAction,
} from '../models/actions';
import { runResumeGeneration, runStartGeneration } from '../orchestrator/phase-runner';
import type { ProjectRecord } from '../models/projects';
import type { ProductArtifactRef } from '../models/artifacts';

export function handleStartGeneration(
  project: ProjectRecord,
  _action: StartGenerationAction,
  artifacts: ProductArtifactRef[],
  now = new Date().toISOString(),
) {
  return runStartGeneration(project, artifacts, now);
}

export function handleResumeGeneration(
  project: ProjectRecord,
  _action: ResumeGenerationAction,
  now = new Date().toISOString(),
) {
  return runResumeGeneration(project, now);
}
