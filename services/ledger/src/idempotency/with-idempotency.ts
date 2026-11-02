import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedClient } from '../auth/types.js';

export interface IdempotentResult {
  status: number;
  body: unknown;
}

export interface IdempotentOutcome extends IdempotentResult {
  replayed: boolean;
}

export function withIdempotency(options: {
  pool: Pool;
  client: AuthenticatedClient;
  key: string;
  hash: string;
  run: (tx: PoolClient) => Promise<IdempotentResult>;
}): Promise<IdempotentOutcome> {
  void options;
  throw new Error('not implemented');
}
