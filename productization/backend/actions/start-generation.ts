import type {
  ResumeGenerationAction,
  StartGenerationAction,
} from '../models/actions';
import { runResumeGeneration, runStartGeneration } from '../orchestrator/phase-runner';
import type { ProjectRecord } from '../models/projects';

export function handleStartGeneration(
  project: ProjectRecord,
  _action: StartGenerationAction,
  now = new Date().toISOString(),
) {
  return runStartGeneration(project, now);
}

export function handleResumeGeneration(
  project: ProjectRecord,
  _action: ResumeGenerationAction,
  now = new Date().toISOString(),
) {
  return runResumeGeneration(project, now);
}
