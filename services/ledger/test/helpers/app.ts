import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app.js';
import { createTestPool } from './db.js';
import { captureLogs } from './logs.js';

export interface TestApp {
  app: FastifyInstance;
  pool: Pool;
  logs(): string;
  close(): Promise<void>;
}

export async function buildTestApp(_options?: {
  routes?: (app: FastifyInstance) => void;
  logs?: boolean;
}): Promise<TestApp> {
  const options = _options ?? {};
  const pool = createTestPool();
  const captured = options.logs === true ? captureLogs() : undefined;
  const app = buildApp({
    pool,
    logger: captured === undefined ? false : { level: 'debug', stream: captured.stream },
  });
  options.routes?.(app);
  await app.ready();

  return {
    app,
    pool,
    logs: () => captured?.text() ?? '',
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
