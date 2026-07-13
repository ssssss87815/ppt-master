import { once } from 'node:events';
import type { Server } from 'node:http';

import { createProjectWorkbenchNodeServer } from './project-workbench-node-server.ts';
import {
  createDurableVerifiedExportWorkbenchDependencies,
  type VerifiedExportWorkbenchOptions,
} from './project-workbench-verified-export-composition.ts';
import type { ExportPersistenceSeed } from '../backend/state/export-persistence-unit-of-work.ts';

export type DurableVerifiedExportWorkbenchStartupOptions = VerifiedExportWorkbenchOptions & {
  statePath: string;
  initialState: ExportPersistenceSeed;
  host?: string;
  port?: number;
};

export type StartedDurableVerifiedExportWorkbench = {
  server: Server;
  origin: string;
  close(): Promise<void>;
};

export function createDurableVerifiedExportWorkbenchServer(
  options: DurableVerifiedExportWorkbenchStartupOptions,
): Server {
  return createProjectWorkbenchNodeServer(createDurableVerifiedExportWorkbenchDependencies(options));
}

export async function startDurableVerifiedExportWorkbench(
  options: DurableVerifiedExportWorkbenchStartupOptions,
): Promise<StartedDurableVerifiedExportWorkbench> {
  const server = createDurableVerifiedExportWorkbenchServer(options);
  const host = options.host ?? '127.0.0.1';
  server.listen(options.port ?? 0, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('durable verified export Workbench did not bind a TCP address');
  }
  return {
    server,
    origin: `http://${host}:${address.port}`,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}
