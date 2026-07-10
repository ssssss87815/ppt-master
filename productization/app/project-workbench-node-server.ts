import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';

import type { ProjectWorkbenchPageDependencies } from './project-workbench-page.js';
import {
  handleProjectWorkbenchHttpRequest,
  type ProjectWorkbenchHttpResponse,
} from './project-workbench-http-route.js';

export type ProjectWorkbenchNodeServerDependencies = ProjectWorkbenchPageDependencies;

type RequestBodyResult =
  | { body: string }
  | { error: string };

function readRequestBody(request: IncomingMessage): Promise<RequestBodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (result: RequestBodyResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => finish({ body: Buffer.concat(chunks).toString('utf8') }));
    request.on('aborted', () => finish({ error: 'Request body aborted' }));
    request.on('error', () => finish({ error: 'Could not read request body' }));
  });
}

function writeResponse(response: ServerResponse, result: ProjectWorkbenchHttpResponse): void {
  response.writeHead(result.status, result.headers);
  response.end(result.body);
}

export function createProjectWorkbenchNodeServer(dependencies: ProjectWorkbenchNodeServerDependencies) {
  return createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    const requestUrl = request.url ?? '/';
    let body: string | undefined;

    if (method.toUpperCase() === 'POST') {
      const bodyResult = await readRequestBody(request);
      if ('error' in bodyResult) {
        writeResponse(response, {
          status: 400,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: bodyResult.error,
        });
        return;
      }
      body = bodyResult.body;
    }

    try {
      const result = await handleProjectWorkbenchHttpRequest(dependencies, {
        method,
        url: requestUrl,
        body,
      });
      writeResponse(response, result);
    } catch {
      writeResponse(response, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: 'Project workbench unavailable',
      });
    }
  });
}
