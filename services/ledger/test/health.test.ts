import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createPool } from '../src/db/pool.js';
import { createTestPool } from './helpers/db.js';

describe('health endpoints (real Postgres)', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createTestPool();
    app = buildApp({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready reaches the real database as the app role', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'up' });
  });

  it('adds a request ID to every response', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores a request ID sent by the client', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'attacker-value' },
    });
    expect(res.headers['x-request-id']).not.toBe('attacker-value');
  });
});

describe('readiness when the database is down', () => {
  it('returns 503', async () => {
    // Port 1 has no database. The connection fails fast.
    const deadPool = createPool('postgres://ledger_app:x@127.0.0.1:1/nope');
    const app = buildApp({ pool: deadPool });
    try {
      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: 'unavailable', db: 'down' });
    } finally {
      await app.close();
      await deadPool.end();
    }
  });
});
