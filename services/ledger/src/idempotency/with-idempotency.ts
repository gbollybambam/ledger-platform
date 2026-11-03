import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedClient } from '../auth/types.js';
import { mapDbError } from '../http/db-errors.js';
import { ApiError } from '../http/errors.js';

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
  return withIdempotencyInternal(options);
}

async function withIdempotencyInternal(options: {
  pool: Pool;
  client: AuthenticatedClient;
  key: string;
  hash: string;
  run: (tx: PoolClient) => Promise<IdempotentResult>;
}): Promise<IdempotentOutcome> {
  const tx = await options.pool.connect();
  let inTransaction = false;
  let destroy = false;

  try {
    await tx.query('BEGIN');
    inTransaction = true;

    const claimed = await tx.query(
      `INSERT INTO idempotency_keys (client_id, key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id, key) DO NOTHING
       RETURNING 1`,
      [options.client.id, options.key, options.hash],
    );

    if (claimed.rowCount === 1) {
      const result = await options.run(tx);
      if (!Number.isInteger(result.status) || result.status < 200 || result.status > 299) {
        throw new Error('Idempotent result status must be a 2xx integer');
      }

      await tx.query(
        `UPDATE idempotency_keys
            SET response_code = $3, response_body = $4::jsonb
          WHERE client_id = $1 AND key = $2`,
        [options.client.id, options.key, result.status, JSON.stringify(result.body)],
      );

      try {
        await tx.query('COMMIT');
        inTransaction = false;
      } catch (error) {
        destroy = true;
        throw mapDbError(error) ?? error;
      }

      return { ...result, replayed: false };
    }

    const existing = await tx.query<{
      request_hash: string;
      response_code: number | null;
      response_body: unknown;
    }>(
      `SELECT request_hash, response_code, response_body
         FROM idempotency_keys
        WHERE client_id = $1 AND key = $2`,
      [options.client.id, options.key],
    );
    const row = existing.rows[0];
    if (row === undefined) {
      throw new Error('Idempotency key disappeared after conflict');
    }
    if (row.request_hash !== options.hash) {
      await tx.query('ROLLBACK');
      inTransaction = false;
      throw new ApiError(
        409,
        'idempotency_key_reused',
        'This Idempotency-Key was used for a different request',
      );
    }
    if (row.response_code === null) {
      throw new Error('Committed idempotency key has no response');
    }

    await tx.query('ROLLBACK');
    inTransaction = false;
    return { status: row.response_code, body: row.response_body, replayed: true };
  } catch (error) {
    if (inTransaction) {
      try {
        await tx.query('ROLLBACK');
      } catch {
        destroy = true;
      }
    }
    throw mapDbError(error) ?? error;
  } finally {
    tx.release(destroy);
  }
}
