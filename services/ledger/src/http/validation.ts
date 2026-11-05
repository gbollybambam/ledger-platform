import type { FastifySchemaValidationError } from 'fastify';
import { ApiError } from './errors.js';

type SchemaErrorDataVar = 'body' | 'headers' | 'params' | 'querystring';

export const KNOWN_FIELDS = new Set([
  'name',
  'kind',
  'currency',
  'allow_negative',
  'external_id',
  'client',
  'id',
]);

export function formatSchemaError(
  errors: FastifySchemaValidationError[],
  _dataVar: SchemaErrorDataVar,
): ApiError {
  void _dataVar;
  const first = errors[0];
  if (first === undefined) {
    return new ApiError(400, 'invalid_request', 'Request is not valid');
  }

  const missing = first.params.missingProperty;
  const field =
    first.keyword === 'required' && typeof missing === 'string'
      ? missing
      : first.instancePath.split('/').filter(Boolean).at(-1);
  const message =
    field !== undefined && KNOWN_FIELDS.has(field)
      ? `Request is not valid: ${field}`
      : 'Request is not valid';
  return new ApiError(400, 'invalid_request', message);
}
