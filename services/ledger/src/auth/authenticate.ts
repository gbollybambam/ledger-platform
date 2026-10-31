import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { hashApiKey } from './keys.js';
import type { Access, Scope } from './types.js';
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

function isExactPublicHealthRequest(request: FastifyRequest): boolean {
  const access = request.routeOptions.config.access;
  return (
    access === 'public' &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    (request.raw.url === '/health' || request.raw.url === '/health/ready')
  );
}

async function authenticateForAccess(
  request: FastifyRequest,
  pool: Pool,
  access: Access | undefined,
): Promise<void> {
  if (access === undefined || access === 'public') {
    if (access === 'public' && isExactPublicHealthRequest(request)) {
      return;
    }
    if (access === 'public') {
      await authenticate(request, pool);
      return;
    }
  } else {
    await authenticate(request, pool);
  }

  if (access === 'ledger:read' || access === 'ledger:write') {
    if (!request.client?.scopes.includes(access)) {
      throw new ApiError(403, 'forbidden', 'Forbidden');
    }
  }
}

export async function authenticateUnknownRequest(
  request: FastifyRequest,
  pool: Pool,
): Promise<void> {
  await authenticate(request, pool);
}

export function registerAuthentication(app: FastifyInstance, pool: Pool): void {
  app.addHook('onRequest', async (request) => {
    const access = request.routeOptions.config.access as Access | undefined;
    await authenticateForAccess(request, pool, access);
  });

  app.setNotFoundHandler(async (request, reply: FastifyReply) => {
    await authenticateUnknownRequest(request, pool);
    return reply.status(404).send({
      error: { code: 'not_found', message: 'Route not found', request_id: request.id },
    });
  });
}
