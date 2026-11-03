import { ApiError } from '../http/errors.js';

export function parseIdempotencyKey(header: string | string[] | undefined): string {
  if (header === undefined || header === '') {
    throw new ApiError(400, 'invalid_request', 'Idempotency-Key header is required');
  }
  if (Array.isArray(header) || !/^[A-Za-z0-9._:-]{8,128}$/.test(header)) {
    throw new ApiError(400, 'invalid_request', 'Idempotency-Key header is not valid');
  }
  return header;
}
