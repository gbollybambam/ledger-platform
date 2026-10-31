import type { FastifyRequest } from 'fastify';
import { ApiError } from '../http/errors.js';
import type { Scope } from './types.js';

export function requireScope(scope: Scope) {
  return (request: FastifyRequest): void => {
    const client = request.client;
    if (client === undefined || !client.scopes.includes(scope)) {
      throw new ApiError(403, 'forbidden', 'Forbidden');
    }
  };
}
