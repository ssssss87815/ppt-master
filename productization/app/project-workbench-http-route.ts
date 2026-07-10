import type { ProjectWorkbenchPageDependencies } from './project-workbench-page';
import { renderProjectWorkbenchPage } from './project-workbench-page';
import { applySubmitConfirmations } from '../backend/actions/submit-confirmations.ts';
import { validateSubmitConfirmationsPayload } from '../backend/models/confirmations.ts';
import type { SubmitConfirmationsAction } from '../backend/models/actions.ts';
import type { ProjectRecord } from '../backend/models/projects.ts';

export type ProjectWorkbenchHttpRequest = {
  method: string;
  url: string;
  body?: string;
};

export type ProjectWorkbenchHttpResponse = {
  status: 200 | 400 | 404 | 405 | 500;
  headers: Record<string, string>;
  body: string;
};

const PROJECT_ROUTE_PREFIX = '/projects/';

function textResponse(status: 400 | 404 | 405, body: string, headers: Record<string, string> = {}): ProjectWorkbenchHttpResponse {
  return {
    status,
    headers: {
      ...headers,
      'content-type': 'text/plain; charset=utf-8',
    },
    body,
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

  // POST /projects/:id — submit_confirmations endpoint
  if (method === 'POST') {
    return handleConfirmationsSubmit(dependencies, projectId, request.body);
  }

  // All other methods are read-only
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

async function handleConfirmationsSubmit(
  dependencies: ProjectWorkbenchPageDependencies,
  projectId: string,
  rawBody: string | undefined,
): Promise<ProjectWorkbenchHttpResponse> {
  // 1. Fetch the project to validate existence and get its current state
  let project: ProjectRecord | null;
  try {
    project = await dependencies.projects.getById(projectId);
  } catch {
    return {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><body><h1>Project unavailable</h1><p>Could not load project data.</p></body></html>',
    };
  }

  if (!project) {
    return textResponse(404, 'Project not found');
  }

  // 2. Parse and validate the request body
  const parsedBody = parseRequestBody(rawBody);
  if (!parsedBody) {
    return textResponse(400, 'Malformed request body: expected JSON with answers');
  }

  // 3. Extract and validate the answers payload
  const answers = parsedBody.answers;
  if (!answers || typeof answers !== 'object') {
    return textResponse(400, 'Missing answers in request body');
  }

  const payload = { answers, lockedAt: typeof parsedBody.lockedAt === 'string' ? parsedBody.lockedAt : undefined };
  if (!validateSubmitConfirmationsPayload(payload)) {
    return textResponse(400, 'Invalid answers: all eight confirmation keys must be present and non-empty');
  }

  // 4. Preserve project identity from the route, not the body
  const action: SubmitConfirmationsAction = {
    type: 'submit_confirmations',
    payload: {
      projectId: project.projectId,
      confirmationSetId: project.projectId,
      answers: payload.answers as SubmitConfirmationsAction['payload']['answers'],
    },
  };

  // 5. Collect existing artifacts before dispatching the action
  const createdAt = new Date().toISOString();
  let existingArtifacts: ProductArtifactRef[] = [];
  try {
    existingArtifacts = await dependencies.artifacts.listByProjectId(projectId);
  } catch {
    // If artifacts are unavailable, proceed with empty list — the action
    // itself doesn't require artifacts beyond what the project record holds.
  }

  let result;
  try {
    result = applySubmitConfirmations(project, action, createdAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Check if it's a status transition error
    if (message.includes('expected project status')) {
      return textResponse(400, `Invalid transition: ${message}`);
    }
    return {
      status: 500 as const,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: `Submission failed: ${message}`,
    };
  }

  // 6. Persist the transition before rendering. A success response must survive a fresh GET.
  if (!dependencies.projects.update || !dependencies.artifacts.createMany || !dependencies.checkpoints.create) {
    return {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><body><h1>Submission unavailable</h1><p>The project store cannot persist confirmation locking.</p></body></html>',
    };
  }

  try {
    await dependencies.projects.update(result.project);
    await dependencies.artifacts.createMany(result.artifacts);
    await dependencies.checkpoints.create(result.checkpoint);
  } catch {
    return {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!doctype html><html><body><h1>Submission unavailable</h1><p>Could not persist confirmation locking.</p></body></html>',
    };
  }

  // 7. Re-render through the same repositories so the response proves persisted state.
  const page = await renderProjectWorkbenchPage(dependencies, projectId);
  return {
    status: page.status,
    headers: { 'content-type': page.contentType },
    body: page.body,
  };
}
