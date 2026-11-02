import type { FastifyInstance } from 'fastify';
import { ApiError } from './errors.js';

export function registerWhoamiRoute(app: FastifyInstance): void {
  app.get('/v1/whoami', { config: { access: 'any-client' } }, (request) => {
    const client = request.client;
    if (client === undefined) {
      throw new ApiError(401, 'unauthorized', 'Unauthorized');
    }

    return {
      client_id: client.id,
      name: client.name,
      scopes: client.scopes,
    };
  });
}
