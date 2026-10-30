import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Pool } from 'pg';
import { registerErrorHandling } from './http/errors.js';
import { registerHealthRoutes } from './http/health.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Every registered route as "METHOD /path". Used to check the OpenAPI contract. */
    routeTable: ReadonlySet<string>;
  }
}

export interface AppDeps {
  pool: Pool;
  logger?: FastifyServerOptions['logger'];
}

const IGNORED_METHODS = new Set(['HEAD', 'OPTIONS']);

export function buildApp({ pool, logger = false }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger,
    // Always make our own request ID. Never trust one sent by a client.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  const routeTable = new Set<string>();
  app.decorate('routeTable', routeTable);
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) {
      if (!IGNORED_METHODS.has(method)) {
        routeTable.add(`${method} ${route.url}`);
      }
    }
  });

  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });

  registerErrorHandling(app);
  registerHealthRoutes(app, pool);

  return app;
}
