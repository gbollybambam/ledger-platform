import { createHash } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPool, testUrls } from './helpers/db.js';

const PERMISSION_DENIED = '42501';
const FIXTURE_ID = '00000000-0000-0000-0000-000000000020';
const FIXTURE_NAME = 'migration-test';
const FIXTURE_KEY = `lk_${'M'.repeat(43)}`;

async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = error.code;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  }
}

describe('clients migration and least privilege', () => {
  let app: pg.Pool;
  let migrator: pg.Client;

  beforeAll(async () => {
    app = createTestPool();
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    await migrator.query('DELETE FROM clients WHERE id = $1', [FIXTURE_ID]);
    await migrator.query(
      `INSERT INTO clients
         (id, name, key_prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        FIXTURE_ID,
        FIXTURE_NAME,
        FIXTURE_KEY.slice(0, 8),
        createHash('sha256').update(FIXTURE_KEY).digest(),
        ['ledger:read'],
      ],
    );
  });

  afterAll(async () => {
    await app.end();
    await migrator.query('DELETE FROM clients WHERE id = $1', [FIXTURE_ID]);
    await migrator.end();
  });

  it('creates the clients table with the RFC columns', async () => {
    const { rows } = await app.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients'
        ORDER BY ordinal_position`,
    );

    expect(rows.map((row) => row.column_name)).toEqual([
      'id',
      'name',
      'key_prefix',
      'key_hash',
      'scopes',
      'status',
      'created_at',
      'revoked_at',
    ]);
  });

  it('allows the app role to select clients but not insert, update, or delete', async () => {
    const { rows } = await app.query<{ count: string }>('SELECT count(*) FROM clients');
    expect(rows[0]?.count).toBeDefined();

    expect(
      await sqlState(
        app.query(
          `INSERT INTO clients (id, name, key_prefix, key_hash, scopes)
           VALUES ('00000000-0000-0000-0000-000000000001', 'permission-test',
                   'lk_test', decode('00', 'hex'), ARRAY['ledger:read'])`,
        ),
      ),
    ).toBe(PERMISSION_DENIED);
    expect(await sqlState(app.query('UPDATE clients SET name = name'))).toBe(PERMISSION_DENIED);
    expect(await sqlState(app.query('DELETE FROM clients'))).toBe(PERMISSION_DENIED);
  });

  it('stores the complete API key hash and only the first eight characters as the prefix', async () => {
    const { rows } = await app.query<{
      row: Record<string, unknown>;
      key_prefix: string;
      key_hash: Buffer;
    }>(
      `SELECT row_to_json(c) AS row, c.key_prefix, c.key_hash
         FROM clients AS c
        WHERE c.id = $1`,
      [FIXTURE_ID],
    );

    const row = rows[0]!;
    const serialized = JSON.stringify(row.row);
    const hexKey = Buffer.from(FIXTURE_KEY, 'utf8').toString('hex');
    const base64Key = Buffer.from(FIXTURE_KEY, 'utf8').toString('base64');
    const base64UrlKey = Buffer.from(FIXTURE_KEY, 'utf8').toString('base64url');

    expect(serialized).not.toContain(FIXTURE_KEY);
    expect(serialized).not.toContain(hexKey);
    expect(serialized).not.toContain(base64Key);
    expect(serialized).not.toContain(base64UrlKey);
    expect(row.key_prefix).toBe(FIXTURE_KEY.slice(0, 8));
    expect(row.key_hash).toEqual(createHash('sha256').update(FIXTURE_KEY).digest());
  });

  it('enforces client constraints in the database', async () => {
    const duplicateNameId = '00000000-0000-0000-0000-000000000021';
    const duplicateHashId = '00000000-0000-0000-0000-000000000022';
    const duplicateHash = createHash('sha256').update('duplicate-hash-key').digest();
    const validHash = createHash('sha256').update('valid-constraint-key').digest();
    const insert = async (
      id: string,
      name: string,
      hash: Buffer,
      scopes: string[],
      status = 'active',
      revokedAt: Date | null = null,
    ) =>
      migrator.query(
        `INSERT INTO clients
           (id, name, key_prefix, key_hash, scopes, status, revoked_at)
         VALUES ($1, $2, 'lk_test', $3, $4, $5, $6)`,
        [id, name, hash, scopes, status, revokedAt],
      );
    const errorCode = async (promise: Promise<unknown>): Promise<string | undefined> => {
      try {
        await promise;
        return undefined;
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          return typeof error.code === 'string' ? error.code : undefined;
        }
        return undefined;
      }
    };

    expect(await errorCode(insert(duplicateNameId, 'empty-scopes', validHash, []))).toBe('23514');
    expect(
      await errorCode(insert(duplicateNameId, 'unknown-scope', validHash, ['ledger:nope'])),
    ).toBe('23514');
    expect(
      await errorCode(
        insert(
          duplicateNameId,
          'active-with-revocation',
          validHash,
          ['ledger:read'],
          'active',
          new Date(),
        ),
      ),
    ).toBe('23514');
    expect(
      await errorCode(
        insert(duplicateNameId, 'revoked-without-timestamp', validHash, ['ledger:read'], 'revoked'),
      ),
    ).toBe('23514');

    try {
      await insert(duplicateNameId, 'constraint-base', validHash, ['ledger:read']);
      expect(
        await errorCode(insert(duplicateHashId, 'constraint-base', duplicateHash, ['ledger:read'])),
      ).toBe('23505');
      expect(
        await errorCode(
          insert('00000000-0000-0000-0000-000000000023', 'another-name', validHash, [
            'ledger:read',
          ]),
        ),
      ).toBe('23505');
    } finally {
      await migrator.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [
        [duplicateNameId, duplicateHashId, '00000000-0000-0000-0000-000000000023'],
      ]);
    }
  });
});
