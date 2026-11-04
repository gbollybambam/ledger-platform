import { ApiError } from './errors.js';

export function mapDbError(error: unknown): ApiError | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === '55P03' || error.code === '40P01' || error.code === '25P04')
  ) {
    return new ApiError(503, 'busy', 'The service is busy. Retry with the same Idempotency-Key.');
  }
  return undefined;
}
