import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createTestPool, testUrls } from './helpers/db.js';

const CLIENT_ID = '00000000-0000-0000-0000-000000000030';
const CLIENT_KEY = `lk_${'E'.repeat(43)}`;

describe('error format', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let migrator: pg.Client;

  beforeAll(async () => {
    pool = createTestPool();
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    await migrator.query('DELETE FROM clients WHERE id = $1', [CLIENT_ID]);
    await migrator.query(
      `INSERT INTO clients
         (id, name, key_prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        CLIENT_ID,
        'errors-test',
        CLIENT_KEY.slice(0, 8),
        createHash('sha256').update(CLIENT_KEY).digest(),
        ['ledger:read'],
      ],
    );
    app = buildApp({ pool });
    app.get('/v1/boom', { config: { access: 'any-client' } }, () => {
      throw new Error('secret internal detail');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await migrator.query('DELETE FROM clients WHERE id = $1', [CLIENT_ID]);
    await migrator.end();
  });

  it('returns the standard body for an unknown route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { authorization: 'Bearer ' + CLIENT_KEY },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Route not found',
        request_id: res.headers['x-request-id'],
      },
    });
  });

  it('hides internal details on a 500', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/boom',
      headers: { authorization: 'Bearer ' + CLIENT_KEY },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret internal detail');
    expect(res.json()).toMatchObject({ error: { code: 'internal_error' } });
  });
});
