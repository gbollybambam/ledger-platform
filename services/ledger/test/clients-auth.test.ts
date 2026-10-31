import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireScope } from '../src/auth/require-scope.js';
import { buildApp } from '../src/app.js';
import { createTestPool, testUrls } from './helpers/db.js';

const API_KEY = `lk_${'A'.repeat(43)}`;
const CLIENT_ID = '00000000-0000-0000-0000-000000000010';
const CLIENT_NAME = 'f1-auth-client';

function authHeader(key = API_KEY): string {
  return `Bearer ${key}`;
}

describe('F1 client authentication', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  let migrator: pg.Client;
  let logs = '';
  let logStream: Writable;

  beforeAll(async () => {
    pool = createTestPool();
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    await migrator.query('DELETE FROM clients WHERE id = $1', [CLIENT_ID]);
    logStream = new Writable({
      write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        logs += typeof chunk === 'string' ? chunk : String(chunk);
        callback();
      },
    });
    app = buildApp({
      pool,
      logger: { level: 'debug', stream: logStream },
    });
    app.get(
      '/test-only/ledger-write',
      { config: { access: 'ledger:write' }, preHandler: requireScope('ledger:write') },
      () => ({
        ok: true,
      }),
    );
    app.post('/test-only/body', { config: { access: 'any-client' } }, () => ({ ok: true }));
    app.get('/internal/status', { config: { access: 'any-client' } }, () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await migrator.end();
  });

  it.each([
    ['missing header', undefined],
    ['wrong scheme', 'Basic credentials'],
    ['unknown key', authHeader()],
    ['prefix alone', authHeader(API_KEY.slice(0, 8))],
  ])('returns the same 401 response for %s', async (_case, authorization) => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: authorization === undefined ? undefined : { authorization },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'unauthorized',
        message: 'Unauthorized',
        request_id: response.headers['x-request-id'],
      },
    });
  });

  it('returns the same unauthorized body for missing, malformed, and unknown keys', async () => {
    const cases = [
      await app.inject({ method: 'GET', url: '/v1/whoami' }),
      await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: 'Basic credentials' },
      }),
      await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: authHeader('lk_unknown') },
      }),
    ];

    const bodies = cases.map((response) => {
      expect(response.statusCode).toBe(401);
      const body: unknown = JSON.parse(response.body);
      if (typeof body !== 'object' || body === null || !('error' in body)) {
        throw new Error('expected an error response');
      }
      return body.error;
    });

    expect(
      bodies.map((body) => {
        if (
          typeof body !== 'object' ||
          body === null ||
          !('code' in body) ||
          !('message' in body)
        ) {
          throw new Error('expected an error body');
        }
        return { code: body.code, message: body.message };
      }),
    ).toEqual([
      { code: 'unauthorized', message: 'Unauthorized' },
      { code: 'unauthorized', message: 'Unauthorized' },
      { code: 'unauthorized', message: 'Unauthorized' },
    ]);
  });

  it('keeps health endpoints public', async () => {
    await expect(app.inject({ method: 'GET', url: '/health' })).resolves.toMatchObject({
      statusCode: 200,
    });
    await expect(app.inject({ method: 'GET', url: '/health/ready' })).resolves.toMatchObject({
      statusCode: 200,
    });
  });

  it('does not make health path variants public', async () => {
    for (const url of ['/health/', '//health', '/health?check=1']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
  });

  it('requires access metadata for every registered route', async () => {
    const candidate = buildApp({ pool });
    expect(() => candidate.get('/test-only/undeclared', () => ({ ok: true }))).toThrow(
      'must declare access',
    );
    await candidate.close();
  });

  it('requires authentication for every registered non-public route', async () => {
    for (const route of app.routeTable) {
      const [method, routePath] = route.split(' ');
      if (routePath === '/health' || routePath === '/health/ready') {
        continue;
      }
      const url = routePath!.replace(/:[^/]+/g, '00000000-0000-0000-0000-000000000000');
      const response = await app.inject({ method: method as 'GET' | 'POST', url });
      expect(response.statusCode, route).toBe(401);
    }
  });

  it('authenticates unknown paths before returning 404', async () => {
    const withoutKey = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
    expect(withoutKey.statusCode).toBe(401);
    expect(withoutKey.json()).toMatchObject({
      error: { code: 'unauthorized', message: 'Unauthorized' },
    });
  });

  it('registers the test-only scope route for authorization tests', () => {
    expect([...app.routeTable]).toContain('GET /test-only/ledger-write');
  });

  it('authenticates before parsing a request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test-only/body',
      headers: {
        'content-type': 'application/json',
      },
      payload: '{"broken"',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'unauthorized', request_id: response.headers['x-request-id'] },
    });
  });

  it('protects non-public routes regardless of their path prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/internal/status',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'unauthorized', message: 'Unauthorized' },
    });
  });

  it('does not include an API key or Authorization header in logs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { authorization: authHeader() },
    });

    expect(response.body).not.toContain(API_KEY);
    expect(response.body).not.toContain('Authorization');
    expect(logs).not.toContain(API_KEY);
    expect(logs).not.toContain('Authorization');
  });
});

describe('F1 authentication integration', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  let migrator: pg.Client;
  let logs = '';
  let logStream: Writable;

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
        CLIENT_NAME,
        API_KEY.slice(0, 8),
        createHash('sha256').update(API_KEY).digest(),
        ['ledger:read'],
      ],
    );
    logStream = new Writable({
      write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        logs += typeof chunk === 'string' ? chunk : String(chunk);
        callback();
      },
    });
    app = buildApp({ pool, logger: { level: 'debug', stream: logStream } });
    app.get(
      '/test-only/ledger-write',
      { config: { access: 'ledger:write' }, preHandler: requireScope('ledger:write') },
      () => ({
        ok: true,
      }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await migrator.query('DELETE FROM clients WHERE id = $1', [CLIENT_ID]);
    await migrator.end();
  });

  it('authenticates a valid key and returns client identity and scopes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { authorization: authHeader() },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      client_id: CLIENT_ID,
      name: CLIENT_NAME,
      scopes: ['ledger:read'],
    });
  });

  it('returns 404 for an unknown path after authenticating a valid key', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/does-not-exist',
      headers: { authorization: authHeader() },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'not_found', message: 'Route not found' },
    });
  });

  it('uses identical 401 responses for every invalid credential case', async () => {
    const cases = [
      await app.inject({ method: 'GET', url: '/v1/whoami' }),
      await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: 'Basic credentials' },
      }),
      await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: authHeader('lk_unknown') },
      }),
    ];

    await migrator.query(
      `UPDATE clients SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [CLIENT_ID],
    );
    cases.push(
      await app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: authHeader() },
      }),
    );

    const requestIds = new Set<string>();
    const comparableBodies = cases.map((response) => {
      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['www-authenticate']).toBe('Bearer');
      const body = response.json<{
        error: { code: string; message: string; request_id: string };
      }>();
      expect(body.error.request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[4-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      requestIds.add(body.error.request_id);
      return { code: body.error.code, message: body.error.message };
    });

    expect(requestIds.size).toBe(cases.length);
    expect(comparableBodies).toEqual([
      { code: 'unauthorized', message: 'Unauthorized' },
      { code: 'unauthorized', message: 'Unauthorized' },
      { code: 'unauthorized', message: 'Unauthorized' },
      { code: 'unauthorized', message: 'Unauthorized' },
    ]);
    await migrator.query(`UPDATE clients SET status = 'active', revoked_at = NULL WHERE id = $1`, [
      CLIENT_ID,
    ]);
  });

  it('captures successful and failed requests without credentials in logs', async () => {
    const successful = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { authorization: authHeader() },
    });
    await migrator.query(
      `UPDATE clients SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [CLIENT_ID],
    );
    const failed = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/whoami' }),
      app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: 'Basic credentials' },
      }),
      app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: authHeader('lk_unknown') },
      }),
      app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: authHeader() },
      }),
    ]);

    expect(successful.statusCode).toBe(200);
    expect(failed.map((response) => response.statusCode)).toEqual([401, 401, 401, 401]);
    expect(logs).not.toBe('');
    expect(logs).not.toContain('Authorization');
    expect(logs).not.toContain(authHeader());
    expect(logs).not.toContain('Basic credentials');
    expect(logs).not.toContain(authHeader('lk_unknown'));
    await migrator.query(`UPDATE clients SET status = 'active', revoked_at = NULL WHERE id = $1`, [
      CLIENT_ID,
    ]);
  });

  it('rejects a client without the required scope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-only/ledger-write',
      headers: { authorization: authHeader() },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'forbidden', request_id: response.headers['x-request-id'] },
    });
  });

  it('rejects a revoked key on the next request', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { authorization: authHeader() },
    });
    expect(before.statusCode).toBe(200);

    await migrator.query(
      `UPDATE clients SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [CLIENT_ID],
    );

    const after = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { authorization: authHeader() },
    });
    expect(after.statusCode).toBe(401);
    expect(after.headers['content-type']).toBe(before.headers['content-type']);
    expect(after.headers['www-authenticate']).toBe('Bearer');
    expect(after.json<{ error: { code: string; message: string } }>().error).toMatchObject({
      code: 'unauthorized',
      message: 'Unauthorized',
    });
  });
});
