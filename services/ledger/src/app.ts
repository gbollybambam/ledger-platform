import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Pool } from 'pg';
import { PUBLIC_PATHS } from './auth/access.js';
import { registerAuthentication } from './auth/authenticate.js';
import { errorBody, registerErrorHandling } from './http/errors.js';
import { registerHealthRoutes } from './http/health.js';
import { registerWhoamiRoute } from './http/whoami.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Every registered route as "METHOD /path". Used to check the OpenAPI contract. */
    routeTable: ReadonlySet<string>;
  }

  interface FastifyContextConfig {
    access?: Access;
  }

  interface FastifyRequest {
    client?: AuthenticatedClient;
  }
}

import type { AuthenticatedClient } from './auth/types.js';
import type { Access } from './auth/types.js';

export interface AppDeps {
  pool: Pool;
  logger?: FastifyServerOptions['logger'];
}

const IGNORED_METHODS = new Set(['HEAD', 'OPTIONS']);

export function buildApp({ pool, logger = false }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger:
      logger === false
        ? false
        : logger === true
          ? {
              redact: {
                paths: ['req.headers.authorization'],
                censor: '[Redact]',
              },
            }
          : {
              ...logger,
              redact: {
                paths: ['req.headers.authorization'],
                censor: '[Redact]',
              },
            },
    frameworkErrors: (_error, _request, reply) => {
      const requestId = randomUUID();
      reply.raw.statusCode = 401;
      reply.raw.setHeader('x-request-id', requestId);
      reply.raw.setHeader('content-type', 'application/json; charset=utf-8');
      reply.raw.setHeader('www-authenticate', 'Bearer');
      reply.raw.end(JSON.stringify(errorBody('unauthorized', 'Unauthorized', requestId)));
    },
    // Always make our own request ID. Never trust one sent by a client.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  const routeTable = new Set<string>();
  app.decorate('routeTable', routeTable);
  app.addHook('onRoute', (route) => {
    if (route.config?.access === undefined) {
      throw new Error(`Route ${String(route.method)} ${route.url} must declare access`);
    }
    if (
      route.config.access === 'public' &&
      (!PUBLIC_PATHS.has(route.url) || !['GET', 'HEAD'].includes(String(route.method)))
    ) {
      throw new Error(`public access is only allowed on GET and HEAD health paths: ${route.url}`);
    }
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
  registerAuthentication(app, pool);
  registerHealthRoutes(app, pool);
  registerWhoamiRoute(app);

  return app;
}
