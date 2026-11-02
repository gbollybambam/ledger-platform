import type { FastifyRequest } from 'fastify';
import type { Access } from './types.js';

export const PUBLIC_PATHS = new Set(['/health', '/health/ready']);

export function isPublicRequest(request: FastifyRequest): boolean {
  const path = request.routeOptions.url;
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    PUBLIC_PATHS.has(path ?? '') &&
    request.raw.url === path
  );
}

export function hasAccess(request: FastifyRequest): boolean {
  const access: Access | undefined = request.routeOptions.config.access;
  if (access === undefined || access === 'any-client' || access === 'public') {
    return true;
  }
  return request.client?.scopes.includes(access) ?? false;
}
