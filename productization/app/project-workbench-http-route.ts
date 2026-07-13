import type { ProjectWorkbenchPageDependencies } from './project-workbench-page.js';
import { renderProjectWorkbenchPage } from './project-workbench-page.js';
import { handleStartGeneration } from '../backend/actions/start-generation.js';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations.js';
import { validateSubmitConfirmationsPayload } from '../backend/models/confirmations.js';
import type { StartGenerationAction, SubmitConfirmationsAction } from '../backend/models/actions.js';
import { hasVerifiedQualityCheck } from '../backend/adapter/quality-check-runtime-bridge.js';
import type { ProductArtifactRef } from '../backend/models/artifacts.js';
import type { ProjectRecord, WorkflowCheckpoint } from '../backend/models/projects.js';

export type ProjectWorkbenchHttpRequest = {
  method: string;
  url: string;
  body?: string;
};

export type ProjectWorkbenchHttpResponse = {
  status: 200 | 400 | 404 | 405 | 413 | 500;
  headers: Record<string, string>;
  body: string;
};

const PROJECT_ROUTE_PREFIX = '/projects/';

function textResponse(
  status: 400 | 404 | 405 | 500,
  body: string,
  headers: Record<string, string> = {},
): ProjectWorkbenchHttpResponse {
  return {
    status,
    headers: {
      ...headers,
      'content-type': 'text/plain; charset=utf-8',
    },
    body,
  };
}

function htmlFailureResponse(
  heading: string,
  detail: string,
): ProjectWorkbenchHttpResponse {
  return {
    status: 500,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><body><h1>${heading}</h1><p>${detail}</p></body></html>`,
  };
}

function parseProjectId(url: string): string | null | undefined {
  const pathname = url.split('?', 1)[0] ?? '';
  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) {
    return undefined;
  }

  const encodedProjectId = pathname.slice(PROJECT_ROUTE_PREFIX.length);
  if (!encodedProjectId || encodedProjectId.includes('/')) {
    return null;
  }

  try {
    const projectId = decodeURIComponent(encodedProjectId);
    return projectId ? projectId : null;
  } catch {
    return null;
  }
}

function parseRequestBody(body: string | undefined): Record<string, unknown> | null {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export async function handleProjectWorkbenchHttpRequest(
  dependencies: ProjectWorkbenchPageDependencies,
  request: ProjectWorkbenchHttpRequest,
): Promise<ProjectWorkbenchHttpResponse> {
  const projectId = parseProjectId(request.url);
  if (projectId === undefined) {
    return textResponse(404, 'Not found');
  }

  if (projectId === null) {
    return textResponse(400, 'Invalid project id');
  }

  const method = request.method.toUpperCase();

  if (method === 'POST') {
    return handleProjectActionPost(dependencies, projectId, request.body);
  }

  if (method !== 'GET') {
    return textResponse(405, 'Method not allowed', { allow: 'GET, POST' });
  }

  const page = await renderProjectWorkbenchPage(dependencies, projectId);
  return {
    status: page.status,
    headers: { 'content-type': page.contentType },
    body: page.body,
  };
}

async function handleProjectActionPost(
  dependencies: ProjectWorkbenchPageDependencies,
  projectId: string,
  rawBody: string | undefined,
): Promise<ProjectWorkbenchHttpResponse> {
  const parsedBody = parseRequestBody(rawBody);
  if (!parsedBody) {
    return textResponse(400, 'Malformed request body: expected JSON action payload');
  }

  const action = typeof parsedBody.action === 'string' ? parsedBody.action : 'submit_confirmations';
  if (action === 'submit_confirmations') {
    return handleConfirmationsSubmit(dependencies, projectId, parsedBody);
  }

  if (action === 'start_generation') {
    return handleStartGenerationSubmit(dependencies, projectId);
  }

  if (action === 'export_pptx') {
    if (!dependencies.exportPptx) {
      return textResponse(400, 'Unsupported action: export_pptx');
    }
    return handleExportPptxSubmit(dependencies, projectId, parsedBody);
  }

  return textResponse(400, `Unsupported action: ${action}`);
}

async function handleConfirmationsSubmit(
  dependencies: ProjectWorkbenchPageDependencies,
  projectId: string,
  parsedBody: Record<string, unknown>,
): Promise<ProjectWorkbenchHttpResponse> {
  let project: ProjectRecord | null;
  try {
    project = await dependencies.projects.getById(projectId);
  } catch {
    return htmlFailureResponse('Project unavailable', 'Could not load project data.');
  }

  if (!project) {
    return textResponse(404, 'Project not found');
  }

  const answers = parsedBody.answers;
  if (!answers || typeof answers !== 'object') {
    return textResponse(400, 'Missing answers in request body');
  }

  const payload = { answers, lockedAt: typeof parsedBody.lockedAt === 'string' ? parsedBody.lockedAt : undefined };
  if (!validateSubmitConfirmationsPayload(payload)) {
    return textResponse(400, 'Invalid answers: all eight confirmation keys must be present and non-empty');
  }

  const action: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: project.projectId,
      confirmationSetId: project.projectId,
      answers: payload.answers as SubmitConfirmationsAction['payload']['answers'],
    },
  };

  const createdAt = new Date().toISOString();
  let existingArtifacts: ProductArtifactRef[] = [];
  try {
    existingArtifacts = await dependencies.artifacts.listByProjectId(projectId);
  } catch {
    existingArtifacts = [];
  }

  let result;
  try {
    result = applySubmitConfirmations(project, action, createdAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('expected project status')) {
      return textResponse(400, `Invalid transition: ${message}`);
    }
    return textResponse(500, `Submission failed: ${message}`);
  }

  if (!dependencies.projects.update || !dependencies.artifacts.createMany || !dependencies.checkpoints.create) {
    return htmlFailureResponse('Submission unavailable', 'The project store cannot persist confirmation locking.');
  }

  try {
    await dependencies.projects.update(result.project);
    await dependencies.artifacts.createMany(result.artifacts);
    await dependencies.checkpoints.create(result.checkpoint);
  } catch {
    return htmlFailureResponse('Submission unavailable', 'Could not persist confirmation locking.');
  }

  const page = await renderProjectWorkbenchPage(dependencies, projectId);
  return {
    status: page.status,
    headers: { 'content-type': page.contentType },
    body: page.body,
  };
}

async function handleExportPptxSubmit(
  dependencies: ProjectWorkbenchPageDependencies,
  projectId: string,
  parsedBody: Record<string, unknown>,
): Promise<ProjectWorkbenchHttpResponse> {
  if (!dependencies.exportPptx) {
    return htmlFailureResponse('Export unavailable', 'No verified export runtime is configured for this workbench.');
  }

  let project: ProjectRecord | null;
  let artifacts: ProductArtifactRef[];
  let checkpoints: WorkflowCheckpoint[];
  try {
    [project, artifacts, checkpoints] = await Promise.all([
      dependencies.projects.getById(projectId),
      dependencies.artifacts.listByProjectId(projectId),
      dependencies.checkpoints.listByProjectId(projectId),
    ]);
  } catch {
    return htmlFailureResponse('Export unavailable', 'Could not load the verified preview evidence.');
  }

  if (!project) {
    return textResponse(404, 'Project not found');
  }

  if (project.status !== 'preview_available' && project.status !== 'export_ready') {
    return textResponse(400, 'Invalid transition: export_pptx requires preview_available status');
  }

  if (project.status === 'preview_available' && !hasVerifiedQualityCheck(project, artifacts, checkpoints)) {
    return textResponse(400, 'Quality Check must pass against the current verified preview before export_pptx');
  }

  const idempotencyKey = typeof parsedBody.idempotencyKey === 'string' && parsedBody.idempotencyKey.length > 0
    ? parsedBody.idempotencyKey
    : null;
  if (!idempotencyKey) {
    return textResponse(400, 'Missing idempotencyKey for export_pptx');
  }

  try {
    const result = await dependencies.exportPptx({ project, artifacts, checkpoints, idempotencyKey });
    if ((result.kind !== 'delivered' && result.kind !== 'completed') || !result.primaryArtifactId) {
      return htmlFailureResponse('Export unavailable', 'Verified export returned no durable delivery.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return htmlFailureResponse('Export unavailable', `Verified export did not commit: ${message}`);
  }

  const page = await renderProjectWorkbenchPage(dependencies, projectId);
  return {
    status: page.status,
    headers: { 'content-type': page.contentType },
    body: page.body,
  };
}

async function handleStartGenerationSubmit(
  dependencies: ProjectWorkbenchPageDependencies,
  projectId: string,
): Promise<ProjectWorkbenchHttpResponse> {
  let project: ProjectRecord | null;
  let existingArtifacts: ProductArtifactRef[] = [];
  let existingCheckpoints: WorkflowCheckpoint[] = [];
  try {
    project = await dependencies.projects.getById(projectId);
    existingArtifacts = await dependencies.artifacts.listByProjectId(projectId);
    existingCheckpoints = dependencies.checkpoints.listByProjectId
      ? await dependencies.checkpoints.listByProjectId(projectId)
      : [];
  } catch {
    return htmlFailureResponse('Project unavailable', 'Could not load project data.');
  }

  if (!project) {
    return textResponse(404, 'Project not found');
  }

  const action: StartGenerationAction = {
    type: 'start_generation',
    payload: {
      projectId: project.projectId,
    },
  };

  let result;
  try {
    result = handleStartGeneration(project, action, existingArtifacts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('requires spec_ready status') ||
      message.includes('requires verified strategist outputs') ||
      message.includes('requires same-run verified strategist outputs')
    ) {
      return textResponse(400, `Invalid transition: ${message}`);
    }
    return textResponse(500, `Start generation failed: ${message}`);
  }

  if (!dependencies.projects.update || !dependencies.artifacts.createMany || !dependencies.checkpoints.create) {
    return htmlFailureResponse('Generation unavailable', 'The project store cannot persist generation start.');
  }

  try {
    await dependencies.projects.update(result.project);
    await dependencies.artifacts.createMany(result.artifacts);
    for (const checkpoint of result.checkpoints) {
      await dependencies.checkpoints.create(checkpoint);
    }
  } catch {
    return htmlFailureResponse('Generation unavailable', 'Could not persist generation start.');
  }

  const page = await renderProjectWorkbenchPage(
    {
      ...dependencies,
      projects: {
        ...dependencies.projects,
        async getById(requestedProjectId: string) {
          if (requestedProjectId !== projectId) {
            return dependencies.projects.getById(requestedProjectId);
          }
          return result.project;
        },
      },
      artifacts: {
        ...dependencies.artifacts,
        async listByProjectId(requestedProjectId: string) {
          if (requestedProjectId !== projectId) {
            return dependencies.artifacts.listByProjectId(requestedProjectId);
          }
          return [...existingArtifacts, ...result.artifacts];
        },
      },
      checkpoints: {
        ...dependencies.checkpoints,
        async getLatestByProjectId(requestedProjectId: string) {
          if (requestedProjectId !== projectId) {
            return dependencies.checkpoints.getLatestByProjectId(requestedProjectId);
          }
          const persistedLatestCheckpoint = dependencies.checkpoints.getLatestByProjectId
            ? await dependencies.checkpoints.getLatestByProjectId(requestedProjectId)
            : null;
          return persistedLatestCheckpoint ?? result.checkpoints[result.checkpoints.length - 1] ?? null;
        },
        async listByProjectId(requestedProjectId: string) {
          if (requestedProjectId !== projectId) {
            return dependencies.checkpoints.listByProjectId
              ? dependencies.checkpoints.listByProjectId(requestedProjectId)
              : [];
          }
          const persistedCheckpoints = dependencies.checkpoints.listByProjectId
            ? await dependencies.checkpoints.listByProjectId(requestedProjectId)
            : [];
          return persistedCheckpoints.length > 0 ? persistedCheckpoints : [...existingCheckpoints, ...result.checkpoints];
        },
      },
    },
    projectId,
  );

  return {
    status: page.status,
    headers: { 'content-type': page.contentType },
    body: page.body,
  };
}
