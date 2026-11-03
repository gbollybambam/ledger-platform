import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import {
  closeTestDb,
  createTestClient,
  withTestClient,
  type TestClient,
} from './helpers/clients.js';
import { expectErrorBody } from './helpers/http.js';
import { testUrls } from './helpers/db.js';
import { ApiError } from '../src/http/errors.js';
import { runIdempotent } from '../src/idempotency/run-idempotent.js';
import { withIdempotency } from '../src/idempotency/with-idempotency.js';

const routePath = '/v1/test-only/idempotent';
const validKey = 'abcdefgh';

describe('idempotency wrapper', () => {
  let testApp: Awaited<ReturnType<typeof buildTestApp>>;
  let app: FastifyInstance;
  let client: TestClient;
  let effectRuns = 0;

  beforeAll(async () => {
    client = await createTestClient({ scopes: ['ledger:write'] });
    testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.post<{ Body: Record<string, unknown> }>(
          routePath,
          { config: { access: 'ledger:write' } },
          (request, reply) =>
            runIdempotent(request, reply, testApp.pool, async (tx: PoolClient) => {
              await tx.query('SELECT 1');
              effectRuns += 1;
              const body = request.body;
              if (
                typeof body === 'object' &&
                body !== null &&
                'fail' in body &&
                body.fail === true
              ) {
                throw new ApiError(422, 'invalid_request', 'forced test failure');
              }
              if (
                typeof body === 'object' &&
                body !== null &&
                'unexpected' in body &&
                body.unexpected === true
              ) {
                throw new Error('forced test failure');
              }
              if (
                typeof body === 'object' &&
                body !== null &&
                'atomic' in body &&
                body.atomic === true
              ) {
                await tx.query(
                  `INSERT INTO idempotency_keys
                     (client_id, key, request_hash, response_code, response_body)
                   VALUES ($1, $2, $3, 200, $4::jsonb)`,
                  [client.id, `atomic-effect-${client.id.slice(0, 8)}`, 'b'.repeat(64), '{}'],
                );
                throw new Error('forced atomic failure');
              }
              return { status: 201, body: { accepted: body ?? null } };
            }),
        );
      },
    });
    app = testApp.app;
  });

  afterAll(async () => {
    await testApp.close();
    await client.remove();
    await closeTestDb();
  });

  async function request(body?: object | null, key = validKey, url = routePath) {
    return app.inject({
      method: 'POST',
      url,
      headers: {
        authorization: client.authorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        'idempotency-key': key,
      },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('replays the first response and runs the handler once', async () => {
    const runsBefore = effectRuns;
    const first = await request({ value: 1 });
    const second = await request({ value: 1 });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(effectRuns - runsBefore).toBe(1);
  });

  it('refuses the same key with a different body', async () => {
    await request({ value: 1 });
    const response = await request({ value: 2 });
    expectErrorBody(response, {
      status: 409,
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was used for a different request',
    });
  });

  it('refuses the same key on a different URL', async () => {
    await request({ value: 1 });
    const response = await request({ value: 1 }, validKey, `${routePath}?other=1`);
    expectErrorBody(response, {
      status: 409,
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was used for a different request',
    });
  });

  it('treats no body and null as equal, but an empty object as different', async () => {
    const first = await request(undefined, 'body-shape-key');
    const nullBody = await request(null, 'body-shape-key');
    expect(nullBody.statusCode).toBe(201);
    expect(nullBody.headers['idempotent-replayed']).toBe('true');
    const emptyObject = await request({}, 'body-shape-key');
    expectErrorBody(emptyObject, {
      status: 409,
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was used for a different request',
    });
    expect(first.json()).toEqual(nullBody.json());
  });

  it('applies 50 parallel identical requests exactly once', async () => {
    expect(testApp.pool.options.max).toBe(10);
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => request({ value: 1 }, 'parallel-key')),
    );
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body)).size).toBe(1);
  });

  it('lets exactly one body win when the same key is used with different bodies', async () => {
    expect(testApp.pool.options.max).toBe(10);
    const responses = await Promise.all([
      request({ value: 1 }, 'different-key'),
      request({ value: 2 }, 'different-key'),
    ]);
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
  });

  it('does not store a failed request', async () => {
    const response = await request({ fail: true }, 'failed-key');
    expect(response.statusCode).toBe(422);
    const retry = await request({ fail: false }, 'failed-key');
    expect(retry.statusCode).toBe(201);
  });

  it('rolls back on an unexpected error', async () => {
    const response = await request({ unexpected: true }, 'unexpected-key');
    expect(response.statusCode).toBe(500);
    expect(effectRuns).toBeGreaterThan(0);
    const retry = await request({ unexpected: false }, 'unexpected-key');
    expect(retry.statusCode).toBe(201);
  });

  it('commits the effect and the key together or not at all', async () => {
    const response = await request({ atomic: true }, 'atomic-key');
    expect(response.statusCode).toBe(500);
    const effect = await testApp.pool.query(
      'SELECT 1 FROM idempotency_keys WHERE client_id = $1 AND key = $2',
      [client.id, `atomic-effect-${client.id.slice(0, 8)}`],
    );
    expect(effect.rowCount).toBe(0);
  });

  it('scopes keys to the client', async () => {
    await withTestClient({ scopes: ['ledger:write'] }, async (other) => {
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: routePath,
          headers: {
            authorization: other.authorization,
            'content-type': 'application/json',
            'idempotency-key': 'shared-key',
          },
          payload: JSON.stringify({ value: 1 }),
        }),
        request({ value: 1 }, 'shared-key'),
      ]);
      expect(responses[0]?.statusCode).toBe(201);
      expect(responses[1]?.statusCode).toBe(201);
    });
  });

  it('answers 503 busy when the key row is locked too long', async () => {
    const lockPool = new pg.Pool({
      connectionString: testUrls().app,
      max: 3,
    });
    const holder = await lockPool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        `INSERT INTO idempotency_keys (client_id, key, request_hash)
         VALUES ($1, $2, $3)`,
        [client.id, 'locked-key', 'a'.repeat(64)],
      );
      const configured = await lockPool.connect();
      await configured.query("SET lock_timeout = '300ms'; SET statement_timeout = '1000ms'");
      configured.release();
      await expect(
        withIdempotency({
          pool: lockPool,
          client,
          key: 'locked-key',
          hash: 'a'.repeat(64),
          run: async () => {
            await Promise.resolve();
            return { status: 201, body: { ok: true } };
          },
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
        code: 'busy',
      });
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
      await lockPool.end();
    }
  });

  it('replays the same JSON value', async () => {
    const first = await request({ nested: { unicode: '€' }, array: [1, 'two'] }, 'json-value-key');
    const second = await request({ nested: { unicode: '€' }, array: [1, 'two'] }, 'json-value-key');
    expect(second.json()).toEqual(first.json());
  });

  it('never leaks a connection', async () => {
    const startRuns = effectRuns;
    for (let index = 0; index < 100; index += 1) {
      await request({ index }, `leak-${String(index).padStart(5, '0')}`);
    }
    expect(effectRuns - startRuns).toBe(100);
    expect(testApp.pool.totalCount - testApp.pool.idleCount).toBe(0);
  });

  it('uses a single connection per request', async () => {
    let enteredRun!: () => void;
    const insideRun = new Promise<void>((resolve) => {
      enteredRun = resolve;
    });
    const responsePromise = withIdempotency({
      pool: testApp.pool,
      client,
      key: 'single-connection-key',
      hash: 'a'.repeat(64),
      run: async (tx) => {
        await tx.query('SELECT 1');
        enteredRun();
        return { status: 200, body: { ok: true } };
      },
    });
    await insideRun;
    expect(testApp.pool.totalCount - testApp.pool.idleCount).toBe(1);
    await responsePromise;
  });
});

describe('idempotency route authentication and misuse', () => {
  it('authenticates before touching idempotency', async () => {
    const testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.post(routePath, { config: { access: 'ledger:write' } }, (request, reply) =>
          runIdempotent(request, reply, testApp.pool, () =>
            Promise.resolve({ status: 201, body: { ok: true } }),
          ),
        );
      },
    });

    try {
      const response = await testApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: { 'idempotency-key': validKey },
        payload: '{}',
      });
      expectErrorBody(response, { status: 401, code: 'unauthorized' });
      await expect(
        testApp.pool.query('SELECT count(*) FROM idempotency_keys'),
      ).resolves.toBeDefined();
    } finally {
      await testApp.close();
    }
  });

  it('forbids a replay after the client lost its scope', async () => {
    const scopeChangingClient = await createTestClient({ scopes: ['ledger:write'] });
    const testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.post(routePath, { config: { access: 'ledger:write' } }, (request, reply) =>
          runIdempotent(request, reply, testApp.pool, () =>
            Promise.resolve({ status: 201, body: { ok: true } }),
          ),
        );
      },
    });
    try {
      const response = await testApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: {
          authorization: scopeChangingClient.authorization,
          'content-type': 'application/json',
          'idempotency-key': validKey,
        },
        payload: '{}',
      });
      expect(response.statusCode).toBe(201);
      await scopeChangingClient.setScopes(['ledger:read']);
      const replay = await testApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: {
          authorization: scopeChangingClient.authorization,
          'content-type': 'application/json',
          'idempotency-key': validKey,
        },
        payload: '{}',
      });
      expectErrorBody(replay, { status: 403, code: 'forbidden' });
      await expect(
        testApp.pool.query('SELECT count(*) FROM idempotency_keys'),
      ).resolves.toBeDefined();
    } finally {
      await testApp.close();
      await scopeChangingClient.remove();
    }
  });

  it('refuses a non-POST request or a missing client', async () => {
    const request = { method: 'GET' } as never;
    const reply = {} as never;
    const run = async () => {
      await Promise.resolve();
      return { status: 200, body: {} };
    };
    await expect(runIdempotent(request, reply, {} as never, run)).rejects.toThrow(
      'request must be POST',
    );
  });
});
