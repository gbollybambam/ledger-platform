import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { hasAccess, isPublicRequest } from './access.js';
import { hashApiKey } from './keys.js';
import type { Scope } from './types.js';
import { ApiError } from '../http/errors.js';

function bearerKey(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (authorization === undefined) {
    throw new ApiError(401, 'unauthorized', 'Unauthorized');
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (match === null) {
    throw new ApiError(401, 'unauthorized', 'Unauthorized');
  }
  return match[1]!;
}

async function authenticate(request: FastifyRequest, pool: Pool): Promise<void> {
  const keyHash = hashApiKey(bearerKey(request));
  const result = await pool.query<{
    id: string;
    name: string;
    scopes: Scope[];
  }>(
    `SELECT id, name, scopes
       FROM clients
      WHERE key_hash = $1 AND status = 'active'`,
    [keyHash],
  );

  const client = result.rows[0];
  if (client === undefined) {
    throw new ApiError(401, 'unauthorized', 'Unauthorized');
  }

  request.client = {
    id: client.id,
    name: client.name,
    scopes: client.scopes,
  };
}

export function registerAuthentication(app: FastifyInstance, pool: Pool): void {
  app.addHook('onRequest', async (request) => {
    if (isPublicRequest(request)) {
      return;
    }

    await authenticate(request, pool);
    if (!hasAccess(request)) {
      throw new ApiError(403, 'forbidden', 'Forbidden');
    }
  });
}
