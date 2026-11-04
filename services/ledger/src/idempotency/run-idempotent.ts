import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { parseIdempotencyKey } from './key.js';
import { requestHash } from './request-hash.js';
import type { IdempotentResult } from './with-idempotency.js';
import { withIdempotency } from './with-idempotency.js';

export async function runIdempotent(
  request: FastifyRequest,
  reply: FastifyReply,
  pool: Pool,
  run: (tx: PoolClient) => Promise<IdempotentResult>,
): Promise<FastifyReply> {
  if (request.method !== 'POST') {
    throw new Error('request must be POST');
  }
  if (request.client === undefined) {
    throw new Error('request client is required');
  }

  const key = parseIdempotencyKey(request.headers['idempotency-key']);
  const outcome = await withIdempotency({
    pool,
    client: request.client,
    key,
    hash: requestHash({
      method: request.method,
      url: request.raw.url ?? request.url,
      body: request.body === undefined ? null : request.body,
    }),
    run,
  });

  if (outcome.replayed) {
    reply.header('idempotent-replayed', 'true');
  }
  return reply.status(outcome.status).send(outcome.body);
}
