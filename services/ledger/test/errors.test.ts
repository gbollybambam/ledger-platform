import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createTestPool } from './helpers/db.js';

describe('error format', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createTestPool();
    app = buildApp({ pool });
    app.get('/boom', () => {
      throw new Error('secret internal detail');
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('returns the standard body for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
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
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret internal detail');
    expect(res.json()).toMatchObject({ error: { code: 'internal_error' } });
  });
});
