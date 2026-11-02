import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { closeTestDb, createTestClient, withTestClient } from './helpers/clients.js';
import { createTestPool } from './helpers/db.js';
import { expectErrorBody, expectIdentical401 } from './helpers/http.js';
import { captureLogs } from './helpers/logs.js';

let pool: Pool;

afterAll(async () => {
  await pool?.end();
  await closeTestDb();
});

describe('shared test helpers', () => {
  beforeAll(async () => {
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
      withTestClient({ name }, async () => {
        throw new Error('callback failed');
      }),
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

  it('rejects a wrong error shape', () => {
    const response = {
      statusCode: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': 'request-1',
      },
      json: () => ({
        error: {
          code: 'invalid_request',
          message: 'Invalid request',
          request_id: 'request-2',
        },
      }),
    };

    expect(() =>
      expectErrorBody(response, {
        status: 400,
        code: 'invalid_request',
        message: 'Invalid request',
      }),
    ).toThrow();
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
    const clients = await Promise.all(
      names.map((name) => createTestClient({ name })),
    );

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
      withTestClient({ name }, async () => {
        expect('actual').toBe('expected');
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
        app.get('/test-only/helper-route', { config: { access: 'public' } }, () => ({
          ok: true,
        }));
      },
    });

    try {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/test-only/helper-route',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
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
});
