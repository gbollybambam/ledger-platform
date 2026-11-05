import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Pool } from 'pg';
import { PUBLIC_PATHS } from './auth/access.js';
import { registerAuthentication } from './auth/authenticate.js';
import { ApiError, errorBody, registerErrorHandling } from './http/errors.js';
import { registerHealthRoutes } from './http/health.js';
import { registerWhoamiRoute } from './http/whoami.js';
import { formatSchemaError } from './http/validation.js';
import { registerAccountRoutes } from './accounts/routes.js';
import { registerCurrencyRoutes } from './currencies/routes.js';

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
    bodyLimit: 65536,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
        allErrors: false,
      },
    },
    schemaErrorFormatter: formatSchemaError,
    frameworkErrors: (error, request, reply) => {
      if (error.code === 'FST_ERR_BAD_URL') {
        reply.raw.statusCode = 401;
        reply.raw.setHeader('content-type', 'application/json; charset=utf-8');
        reply.raw.setHeader('www-authenticate', 'Bearer');
        reply.raw.setHeader('x-request-id', request.id);
        reply.raw.end(JSON.stringify(errorBody('unauthorized', 'Unauthorized', request.id)));
        return;
      }
      reply.raw.statusCode = error.statusCode ?? 500;
      reply.raw.end(error.message);
    },
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
    // Always make our own request ID. Never trust one sent by a client.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
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
  app.addHook('preValidation', (request, _reply, done) => {
    if (
      request.method === 'POST' &&
      typeof request.body === 'object' &&
      request.body !== null &&
      !Array.isArray(request.body) &&
      (Object.prototype.hasOwnProperty.call(request.body, '__proto__') ||
        Object.prototype.hasOwnProperty.call(request.body, 'constructor'))
    ) {
      throw new ApiError(400, 'invalid_request', 'Request is not valid');
    }
    if (
      request.method === 'POST' &&
      request.body === undefined &&
      request.headers['content-type']?.startsWith('application/json')
    ) {
      throw new ApiError(400, 'invalid_request', 'Request is not valid');
    }
    done();
  });

  registerErrorHandling(app);
  registerAuthentication(app, pool);
  registerHealthRoutes(app, pool);
  registerWhoamiRoute(app);
  registerAccountRoutes(app, pool);
  registerCurrencyRoutes(app, pool);

  return app;
}
