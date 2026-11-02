import type { ApiError } from './errors.js';

export function mapDbError(error: unknown): ApiError | undefined {
  void error;
  throw new Error('not implemented');
}
