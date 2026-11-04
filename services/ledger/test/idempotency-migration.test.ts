import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testUrls } from './helpers/db.js';

describe('idempotency migration', () => {
  let owner: pg.Client;
  let app: pg.Pool;
  const clientId = randomUUID();

  beforeAll(async () => {
    owner = new pg.Client({ connectionString: testUrls().migrator });
    await owner.connect();
    app = new pg.Pool({ connectionString: testUrls().app, max: 2 });
    await owner.query(
      `INSERT INTO clients (id, name, key_prefix, key_hash, scopes)
       VALUES ($1, $2, 'migration-test', repeat('a', 64)::bytea, ARRAY['ledger:write']::text[])`,
      [clientId, `migration-${clientId}`],
    );
  });

  afterAll(async () => {
    await owner.query('DELETE FROM idempotency_keys WHERE client_id = $1', [clientId]);
    await owner.query('DELETE FROM clients WHERE id = $1', [clientId]);
    await app.end();
    await owner.end();
  });

  async function appError(text: string, values: unknown[] = []): Promise<pg.DatabaseError> {
    try {
      await app.query(text, values);
      throw new Error('expected app query to fail');
    } catch (error) {
      return error as pg.DatabaseError;
    }
  }

  it('protects stored responses with database privileges and triggers', async () => {
    const key = `stored-${randomUUID().slice(0, 8)}`;
    try {
      await owner.query(
        `INSERT INTO idempotency_keys
           (client_id, key, request_hash, response_code, response_body)
         VALUES ($1, $2, $3, 201, '{}'::jsonb)`,
        [clientId, key, 'a'.repeat(64)],
      );
      const secondUpdate = await appError(
        `UPDATE idempotency_keys
            SET response_code = 202, response_body = '{}'::jsonb
          WHERE client_id = $1 AND key = $2`,
        [clientId, key],
      );
      expect(secondUpdate.code).toBe('23000');
      const hashUpdate = await appError(
        `UPDATE idempotency_keys SET request_hash = $3 WHERE client_id = $1 AND key = $2`,
        [clientId, key, 'b'.repeat(64)],
      );
      expect(hashUpdate.code).toBe('42501');
      const deletion = await appError(
        'DELETE FROM idempotency_keys WHERE client_id = $1 AND key = $2',
        [clientId, key],
      );
      expect(deletion.code).toBe('42501');
      const privilege = await owner.query<{ update_response: boolean; delete_key: boolean }>(
        `SELECT
           has_column_privilege('ledger_app', 'idempotency_keys', 'response_code', 'UPDATE') AS update_response,
           has_table_privilege('ledger_app', 'idempotency_keys', 'DELETE') AS delete_key`,
      );
      expect(privilege.rows[0]).toEqual({ update_response: true, delete_key: false });
    } finally {
      await owner.query('DELETE FROM idempotency_keys WHERE client_id = $1 AND key = $2', [
        clientId,
        key,
      ]);
    }
  });

  it('enforces database formats and response pairing', async () => {
    const cases = [
      ['7 chars', '1234567', 'a'.repeat(64), null, null],
      ['bad hash', `hash-${randomUUID().slice(0, 8)}`, 'not-64-hex', null, null],
      ['low status', `low-${randomUUID().slice(0, 8)}`, 'a'.repeat(64), 199, '{}'],
      ['high status', `high-${randomUUID().slice(0, 8)}`, 'a'.repeat(64), 500, '{}'],
      ['missing body', `body-${randomUUID().slice(0, 8)}`, 'a'.repeat(64), 201, null],
    ] as const;
    for (const [name, key, hash, status, body] of cases) {
      const error = await appError(
        `INSERT INTO idempotency_keys
           (client_id, key, request_hash, response_code, response_body)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [clientId, key, hash, status, body === null ? null : body],
      );
      expect(error.code, name).toBe('23514');
    }
  });

  it('uses only the required app privileges', async () => {
    const result = await owner.query<{
      select_key: boolean;
      insert_key: boolean;
      update_response: boolean;
      update_hash: boolean;
      delete_key: boolean;
    }>(
      `SELECT
         has_column_privilege('ledger_app', 'idempotency_keys', 'response_code', 'SELECT') AS select_key,
         has_table_privilege('ledger_app', 'idempotency_keys', 'INSERT') AS insert_key,
         has_column_privilege('ledger_app', 'idempotency_keys', 'response_code', 'UPDATE') AS update_response,
         has_column_privilege('ledger_app', 'idempotency_keys', 'request_hash', 'UPDATE') AS update_hash,
         has_table_privilege('ledger_app', 'idempotency_keys', 'DELETE') AS delete_key`,
    );
    expect(result.rows[0]).toEqual({
      select_key: true,
      insert_key: true,
      update_response: true,
      update_hash: false,
      delete_key: false,
    });
  });

  it('refuses to commit a key without a response as the owner role', async () => {
    const key = `pending-${randomUUID().slice(0, 8)}`;
    try {
      await owner.query('BEGIN');
      await owner.query(
        `INSERT INTO idempotency_keys (client_id, key, request_hash)
         VALUES ($1, $2, $3)`,
        [clientId, key, 'a'.repeat(64)],
      );
      await expect(owner.query('COMMIT')).rejects.toMatchObject({ code: '23000' });
    } finally {
      await owner.query('ROLLBACK').catch(() => undefined);
      await owner.query('DELETE FROM idempotency_keys WHERE client_id = $1 AND key = $2', [
        clientId,
        key,
      ]);
    }
  });

  it('allows the owner role to commit a key with a response', async () => {
    const key = `complete-${randomUUID().slice(0, 8)}`;
    try {
      await owner.query(
        `INSERT INTO idempotency_keys
           (client_id, key, request_hash, response_code, response_body)
         VALUES ($1, $2, $3, 201, '{}'::jsonb)`,
        [clientId, key, 'a'.repeat(64)],
      );
      const result = await owner.query<{ response_code: number }>(
        'SELECT response_code FROM idempotency_keys WHERE client_id = $1 AND key = $2',
        [clientId, key],
      );
      expect(result.rows[0]?.response_code).toBe(201);
    } finally {
      await owner.query('DELETE FROM idempotency_keys WHERE client_id = $1 AND key = $2', [
        clientId,
        key,
      ]);
    }
  });

  it('documents the idempotency contract', () => {
    const spec = parse(readFileSync(join(process.cwd(), 'openapi', 'ledger.v1.yaml'), 'utf8')) as {
      components: {
        headers: Record<string, { schema?: { enum?: string[] } }>;
        parameters: Record<string, { schema?: { pattern?: string } }>;
        responses: Record<string, { description?: string; headers?: Record<string, unknown> }>;
      };
    };
    expect(spec.components.headers.IdempotentReplayed?.schema?.enum).toEqual(['true']);
    expect(spec.components.parameters.IdempotencyKey?.schema?.pattern).toBe(
      '^[A-Za-z0-9._:-]{8,128}$',
    );
    expect(spec.components.responses.Busy?.headers).toHaveProperty('Retry-After');
    expect(spec.components.responses.Conflict?.description).toContain('idempotency_key_reused');
  });
});
