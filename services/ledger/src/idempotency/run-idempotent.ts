import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { IdempotentResult } from './with-idempotency.js';

export function runIdempotent(
  request: FastifyRequest,
  reply: FastifyReply,
  pool: Pool,
  run: (tx: PoolClient) => Promise<IdempotentResult>,
): Promise<FastifyReply> {
  void request;
  void reply;
  void pool;
  void run;
  throw new Error('not implemented');
}
