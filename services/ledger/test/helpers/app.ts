import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

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
  throw new Error('not implemented');
}
