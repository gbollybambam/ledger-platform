import type { FastifyError, FastifyInstance } from 'fastify';

/** The one error format for the whole API (see docs/rfc-001.md). */
export function errorBody(code: string, message: string, requestId: string) {
  return { error: { code, message, request_id: requestId } };
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      if (error.statusCode === 401) {
        reply.header('www-authenticate', 'Bearer');
      }
      return reply.status(error.statusCode).send(errorBody(error.code, error.message, request.id));
    }

    const status = error.statusCode ?? 500;

    if (status >= 400 && status < 500) {
      if (status === 401) {
        reply.header('www-authenticate', 'Bearer');
      }
      const code = status === 400 ? 'invalid_request' : 'client_error';
      return reply.status(status).send(errorBody(code, error.message, request.id));
    }

    // Never send internal details to the client. Log them instead.
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(errorBody('internal_error', 'Something went wrong', request.id));
  });
}
