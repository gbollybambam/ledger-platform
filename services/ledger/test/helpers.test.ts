import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { closeTestDb, createTestClient, withTestClient } from './helpers/clients.js';
import { createTestPool, testUrls } from './helpers/db.js';
import { expectErrorBody, expectIdentical401 } from './helpers/http.js';
import { captureLogs } from './helpers/logs.js';

let pool: Pool;

interface TestResponse {
  statusCode: number;
  headers: Record<string, string>;
  json(): unknown;
}

afterAll(async () => {
  await pool?.end();
  await closeTestDb();
});

describe('shared test helpers', () => {
  beforeAll(() => {
    pool = createTestPool();
  });

  it('creates unique clients in parallel', async () => {
    const clients = await Promise.all(
      Array.from({ length: 50 }, () => createTestClient({ scopes: ['ledger:read'] })),
    );

    try {
      expect(new Set(clients.map((client) => client.id)).size).toBe(50);
      expect(new Set(clients.map((client) => client.name)).size).toBe(50);
      expect(new Set(clients.map((client) => client.key)).size).toBe(50);
      expect(clients.every((client) => client.authorization === `Bearer ${client.key}`)).toBe(true);
    } finally {
      await Promise.all(clients.map((client) => client.remove()));
    }
  });

  it('cleans up when the callback throws', async () => {
    const name = `throw-${randomUUID()}`;

    await expect(
      withTestClient({ name }, () => Promise.reject(new Error('callback failed'))),
    ).rejects.toThrow('callback failed');

    const result = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM clients WHERE name = $1',
      [name],
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('remove deletes the client row', async () => {
    const client = await createTestClient({ name: `remove-${randomUUID()}` });

    await client.remove();

    const result = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM clients WHERE id = $1',
      [client.id],
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it.each([
    [
      'extra error field',
      {
        error: {
          code: 'invalid_request',
          message: 'Invalid request',
          request_id: 'request-1',
          extra: 'unexpected',
        },
      },
    ],
    ['missing request_id', { error: { code: 'invalid_request', message: 'Invalid request' } }],
    [
      'request_id differs from header',
      {
        error: {
          code: 'invalid_request',
          message: 'Invalid request',
          request_id: 'request-2',
        },
      },
    ],
    ['non-JSON content type', { error: { code: 'invalid_request', message: 'Invalid request' } }],
    [
      'wrong status',
      {
        error: {
          code: 'invalid_request',
          message: 'Invalid request',
          request_id: 'request-1',
        },
      },
    ],
    [
      'wrong code',
      {
        error: {
          code: 'other_error',
          message: 'Invalid request',
          request_id: 'request-1',
        },
      },
    ],
  ])('expectErrorBody rejects %s', (_case, body) => {
    const response = {
      statusCode: _case === 'wrong status' ? 422 : 400,
      headers: {
        'content-type': _case === 'non-JSON content type' ? 'text/plain' : 'application/json',
        'x-request-id': 'request-1',
      },
      json: () => body,
    };
    let didThrow = false;

    try {
      expectErrorBody(response, {
        status: 400,
        code: 'invalid_request',
        message: 'Invalid request',
      });
    } catch (error) {
      didThrow = true;
      expect(error).not.toMatchObject({ message: 'not implemented' });
    }

    expect(didThrow).toBe(true);
  });

  it('accepts the exact error shape', () => {
    const requestId = 'request-1';
    const response = {
      statusCode: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': requestId,
      },
      json: () => ({
        error: {
          code: 'invalid_request',
          message: 'Invalid request',
          request_id: requestId,
        },
      }),
    };

    expect(() =>
      expectErrorBody(response, {
        status: 400,
        code: 'invalid_request',
        message: 'Invalid request',
      }),
    ).not.toThrow();
  });

  it('leaves no test clients behind', async () => {
    const names = Array.from({ length: 5 }, () => `cleanup-${randomUUID()}`);
    const clients = await Promise.all(names.map((name) => createTestClient({ name })));

    await Promise.all(clients.map((client) => client.remove()));

    const result = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM clients WHERE name = ANY($1::text[])',
      [names],
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('rejects 401 responses that differ', () => {
    const responses = [
      {
        statusCode: 401,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': 'Bearer',
          'x-request-id': 'request-1',
        },
        json: () => ({
          error: { code: 'unauthorized', message: 'Unauthorized', request_id: 'request-1' },
        }),
      },
      {
        statusCode: 401,
        headers: {
          'content-type': 'text/plain',
          'www-authenticate': 'Bearer',
          'x-request-id': 'request-2',
        },
        json: () => ({
          error: { code: 'unauthorized', message: 'Unauthorized', request_id: 'request-2' },
        }),
      },
    ];

    expect(() => expectIdentical401(responses)).toThrow();
  });

  it.each([
    ['different status', (response: TestResponse) => ({ ...response, statusCode: 403 })],
    [
      'different www-authenticate header',
      (response: TestResponse) => ({
        ...response,
        headers: { ...response.headers, 'www-authenticate': 'Basic' },
      }),
    ],
    [
      'different message',
      (response: TestResponse) => ({
        ...response,
        json: () => ({
          error: {
            code: 'unauthorized',
            message: 'Different',
            request_id: 'request-2',
          },
        }),
      }),
    ],
    [
      'duplicate request_id',
      (response: TestResponse) => ({
        ...response,
        headers: { ...response.headers, 'x-request-id': 'request-1' },
        json: () => ({
          error: { code: 'unauthorized', message: 'Unauthorized', request_id: 'request-1' },
        }),
      }),
    ],
  ])('expectIdentical401 rejects %s', (_case, mutate) => {
    const responses = ['request-1', 'request-2'].map((requestId) => ({
      statusCode: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer',
        'x-request-id': requestId,
      },
      json: () => ({
        error: { code: 'unauthorized', message: 'Unauthorized', request_id: requestId },
      }),
    }));
    const mutated = [responses[0]!, mutate(responses[1]!)];
    let didThrow = false;

    try {
      expectIdentical401(mutated);
    } catch (error) {
      didThrow = true;
      expect(error).not.toMatchObject({ message: 'not implemented' });
    }

    expect(didThrow).toBe(true);
  });

  it('accepts identical 401 responses with distinct request IDs', () => {
    const responses = ['request-1', 'request-2'].map((requestId) => ({
      statusCode: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer',
        'x-request-id': requestId,
      },
      json: () => ({
        error: { code: 'unauthorized', message: 'Unauthorized', request_id: requestId },
      }),
    }));

    expect(() => expectIdentical401(responses)).not.toThrow();
  });

  it('supports two scopes, one scope, and custom names', async () => {
    const twoScopes = await createTestClient({ scopes: ['ledger:read', 'ledger:write'] });
    const oneScope = await createTestClient({ scopes: ['ledger:write'] });
    const customName = `custom-${randomUUID()}`;
    const named = await createTestClient({ name: customName });

    try {
      expect(twoScopes.scopes).toEqual(['ledger:read', 'ledger:write']);
      expect(oneScope.scopes).toEqual(['ledger:write']);
      expect(named.name).toBe(customName);
    } finally {
      await Promise.all([twoScopes.remove(), oneScope.remove(), named.remove()]);
    }
  });

  it('createTestClient uses the documented defaults', async () => {
    const client = await createTestClient();

    try {
      expect(client.scopes).toEqual(['ledger:read']);
      expect(client.name).toMatch(/^t-[0-9a-f]{8}$/);
      expect(client.authorization).toBe(`Bearer ${client.key}`);
      expect(client.key).toMatch(/^lk_[A-Za-z0-9_-]{43}$/);
    } finally {
      await client.remove();
    }
  });

  it('revokes a client and the key is rejected by the API', async () => {
    const client = await createTestClient();
    const testApp = await buildTestApp();

    try {
      await client.revoke();
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/v1/whoami',
        headers: { authorization: client.authorization },
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await client.remove();
      await testApp.close();
    }
  });

  it('cleans up after a failing assertion inside withTestClient', async () => {
    const name = `assertion-${randomUUID()}`;

    await expect(
      withTestClient({ name }, () => {
        expect('actual').toBe('expected');
        return Promise.resolve();
      }),
    ).rejects.toThrow();

    const result = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM clients WHERE name = $1',
      [name],
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('builds an app with logs disabled and closes its connections', async () => {
    const testApp = await buildTestApp();

    expect(testApp.app).toBeDefined();
    expect(testApp.pool).toBeDefined();
    expect(testApp.logs()).toBe('');

    await testApp.close();
  });

  it('builds an app with logs enabled', async () => {
    const testApp = await buildTestApp({ logs: true });

    try {
      await testApp.app.inject({ method: 'GET', url: '/health' });
      expect(testApp.logs()).not.toBe('');
    } finally {
      await testApp.close();
    }
  });

  it('builds an app with extra routes before ready', async () => {
    const testApp = await buildTestApp({
      routes: (app: FastifyInstance) => {
        app.get('/test-only/helper-route', { config: { access: 'any-client' } }, () => ({
          ok: true,
        }));
      },
    });
    const client = await createTestClient();

    try {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/test-only/helper-route',
        headers: { authorization: client.authorization },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await client.remove();
      await testApp.close();
    }
  });

  it('captureLogs returns text and parsed JSON lines', () => {
    const logs = captureLogs();
    logs.stream.write('{"level":30}\n{"level":40}\n');

    expect(logs.text()).toBe('{"level":30}\n{"level":40}\n');
    expect(logs.lines()).toEqual([{ level: 30 }, { level: 40 }]);
  });

  it('captureLogs lines throws when a line is not JSON', () => {
    const logs = captureLogs();
    logs.stream.write('not json\n');

    expect(() => logs.lines()).toThrow();
  });

  it('closeTestDb closes the named shared migrator connection', async () => {
    const client = await createTestClient({ name: `application-name-${randomUUID()}` });
    const cleanup = new pg.Client({ connectionString: testUrls().migrator });

    try {
      const before = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM pg_stat_activity
          WHERE application_name = 'ledger-test-helper'`,
      );
      expect(before.rows[0]?.count).toBe('1');

      await closeTestDb();

      const after = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM pg_stat_activity
          WHERE application_name = 'ledger-test-helper'`,
      );
      expect(after.rows[0]?.count).toBe('0');
    } finally {
      await cleanup.connect();
      await cleanup.query('DELETE FROM clients WHERE id = $1', [client.id]);
      await cleanup.end();
    }
  });
});
