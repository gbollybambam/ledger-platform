import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import {
  closeTestDb,
  createTestClient,
  uniqueKey,
  withTestClient,
  type TestClient,
} from './helpers/clients.js';
import { expectErrorBody } from './helpers/http.js';
import { testUrls } from './helpers/db.js';
import { ApiError } from '../src/http/errors.js';
import { runIdempotent } from '../src/idempotency/run-idempotent.js';
import { withIdempotency } from '../src/idempotency/with-idempotency.js';

const routePath = '/v1/test-only/idempotent';
let owner: pg.Client;
const effectsTable = `idempotency_effects_${randomUUID().replaceAll('-', '')}`;

async function countEffects(pool: pg.Pool, key?: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    key === undefined
      ? `SELECT count(*)::text AS count FROM ${effectsTable}`
      : `SELECT count(*)::text AS count FROM ${effectsTable} WHERE request_key = $1`,
    key === undefined ? [] : [key],
  );
  return Number(result.rows[0]?.count ?? 0);
}

beforeAll(async () => {
  owner = new pg.Client({ connectionString: testUrls().migrator });
  await owner.connect();
  await owner.query(
    `CREATE TABLE ${effectsTable} (
       id bigserial PRIMARY KEY,
       request_key text NOT NULL,
       body jsonb NOT NULL
     )`,
  );
  await owner.query(`GRANT INSERT, SELECT ON ${effectsTable} TO ledger_app`);
  await owner.query(`GRANT USAGE, SELECT ON SEQUENCE ${effectsTable}_id_seq TO ledger_app`);
});

describe('idempotency wrapper', () => {
  let testApp: Awaited<ReturnType<typeof buildTestApp>>;
  let app: FastifyInstance;
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestClient({ scopes: ['ledger:write'] });
    testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.post<{ Body: Record<string, unknown> }>(
          routePath,
          { config: { access: 'ledger:write' } },
          (request, reply) =>
            runIdempotent(request, reply, testApp.pool, async (tx: PoolClient) => {
              const body = request.body;
              await tx.query(
                `INSERT INTO ${effectsTable} (request_key, body)
                 VALUES ($1, $2::jsonb)`,
                [request.headers['idempotency-key'], JSON.stringify(body ?? null)],
              );
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
                'dbError' in body &&
                body.dbError === true
              ) {
                await tx.query('SELECT 1 / 0');
              }
              if (
                typeof body === 'object' &&
                body !== null &&
                'atomic' in body &&
                body.atomic === true
              ) {
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
  });

  async function request(body: object | null | undefined, key: string, url = routePath) {
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

  async function effectCount(key?: string): Promise<number> {
    return countEffects(testApp.pool, key);
  }

  async function keyCount(key: string): Promise<number> {
    const result = await testApp.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM idempotency_keys WHERE client_id = $1 AND key = $2',
      [client.id, key],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  it('replays the first response and runs the handler once', async () => {
    const key = uniqueKey();
    const first = await request({ value: 1 }, key);
    const second = await request({ value: 1 }, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await effectCount(key)).toBe(1);
  });

  it('refuses the same key with a different body', async () => {
    const key = uniqueKey();
    await request({ value: 1 }, key);
    const before = await effectCount(key);
    const response = await request({ value: 2 }, key);
    expectErrorBody(response, {
      status: 409,
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was used for a different request',
    });
    expect(await effectCount(key)).toBe(before);
  });

  it('refuses the same key on a different URL', async () => {
    const key = uniqueKey();
    await request({ value: 1 }, key);
    const before = await effectCount(key);
    const response = await request({ value: 1 }, key, `${routePath}?other=1`);
    expectErrorBody(response, {
      status: 409,
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was used for a different request',
    });
    expect(await effectCount(key)).toBe(before);
  });

  it('treats no body and null as equal, but an empty object as different', async () => {
    const key = uniqueKey();
    const first = await request(undefined, key);
    const nullBody = await request(null, key);
    expect(nullBody.statusCode).toBe(201);
    expect(nullBody.headers['idempotent-replayed']).toBe('true');
    const emptyObject = await request({}, key);
    expectErrorBody(emptyObject, {
      status: 409,
      code: 'idempotency_key_reused',
      message: 'This Idempotency-Key was used for a different request',
    });

    expect(first.json()).toEqual(nullBody.json());
  });

  it('rejects invalid Idempotency-Key headers over HTTP without writing rows', async () => {
    const cases = [
      ['missing', undefined, 'Idempotency-Key header is required'],
      ['7 characters', '1234567', 'Idempotency-Key header is not valid'],
      ['129 characters', 'a'.repeat(129), 'Idempotency-Key header is not valid'],
      ['bad character', 'bad key!', 'Idempotency-Key header is not valid'],
      ['two joined headers', 'abcdefgh,ijklmnop', 'Idempotency-Key header is not valid'],
    ] as const;
    for (const [name, key, message] of cases) {
      const before = await testApp.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM idempotency_keys WHERE client_id = $1',
        [client.id],
      );
      const headers = {
        authorization: client.authorization,
        'content-type': 'application/json',
        ...(key === undefined ? {} : { 'idempotency-key': key }),
      };
      const response = await app.inject({
        method: 'POST',
        url: routePath,
        headers,
        payload: '{}',
      });
      expectErrorBody(response, { status: 400, code: 'invalid_request', message });
      const after = await testApp.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM idempotency_keys WHERE client_id = $1',
        [client.id],
      );
      expect(after.rows[0]?.count, name).toBe(before.rows[0]?.count);
    }
  });

  it('applies 50 parallel identical requests exactly once', async () => {
    expect(testApp.pool.options.max).toBe(10);
    const key = uniqueKey();
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => request({ value: 1 }, key)),
    );
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body)).size).toBe(1);
    expect(await effectCount(key)).toBe(1);
    expect(
      responses.filter((response) => response.headers['idempotent-replayed'] === undefined),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.headers['idempotent-replayed'] === 'true'),
    ).toHaveLength(49);
  });

  it('lets exactly one body win when the same key is used with different bodies', async () => {
    expect(testApp.pool.options.max).toBe(10);
    const key = uniqueKey();
    const responses = await Promise.all([request({ value: 1 }, key), request({ value: 2 }, key)]);
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
    expect(await effectCount(key)).toBe(1);
    expect(responses.every((response) => response.statusCode < 500)).toBe(true);
  });

  it('does not store a failed request', async () => {
    const key = uniqueKey();
    const response = await request({ fail: true }, key);
    expect(response.statusCode).toBe(422);
    expect(await effectCount(key)).toBe(0);
    const retry = await request({ fail: false }, key);
    expect(retry.statusCode).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
    expect(await effectCount(key)).toBe(1);
  });

  it('rolls back on an unexpected error', async () => {
    const key = uniqueKey();
    const response = await request({ unexpected: true }, key);
    expectErrorBody(response, {
      status: 500,
      code: 'internal_error',
      message: 'Something went wrong',
    });
    expect(response.body).not.toContain('forced test failure');
    expect(await effectCount(key)).toBe(0);
    const retry = await request({ unexpected: false }, key);
    expect(retry.statusCode).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
  });

  it('commits the effect and the key together or not at all', async () => {
    const key = uniqueKey();
    const response = await request({ atomic: true }, key);
    expect(response.statusCode).toBe(500);
    expect(await effectCount(key)).toBe(0);
    expect(await keyCount(key)).toBe(0);
    const success = await request({ atomic: false }, key);
    expect(success.statusCode).toBe(201);
    expect(await effectCount(key)).toBe(1);
    expect(await keyCount(key)).toBe(1);
  });

  it('scopes keys to the client', async () => {
    const key = uniqueKey();
    await withTestClient({ scopes: ['ledger:write'] }, async (other) => {
      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: routePath,
          headers: {
            authorization: other.authorization,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          payload: JSON.stringify({ value: 1 }),
        }),
        request({ value: 1 }, key),
      ]);
      expect(responses[0]?.statusCode).toBe(201);
      expect(responses[1]?.statusCode).toBe(201);
      expect(responses[0]?.headers['idempotent-replayed']).toBeUndefined();
      expect(responses[1]?.headers['idempotent-replayed']).toBeUndefined();
      expect(await effectCount(key)).toBe(2);
    });
  });

  it('answers 503 busy when the key row is locked too long', async () => {
    const lockPool = new pg.Pool({
      connectionString: testUrls().app,
      max: 3,
      lock_timeout: 300,
      statement_timeout: 1000,
    });
    const holder = await lockPool.connect();
    const key = `locked-${randomUUID().slice(0, 8)}`;
    const lockedApp = await buildTestApp({
      pool: lockPool,
      routes: (candidate) => {
        candidate.post(routePath, { config: { access: 'ledger:write' } }, (request, reply) =>
          runIdempotent(request, reply, lockPool, () =>
            Promise.resolve({ status: 201, body: { ok: true } }),
          ),
        );
      },
    });
    try {
      await holder.query('BEGIN');
      await holder.query(
        `INSERT INTO idempotency_keys (client_id, key, request_hash)
         VALUES ($1, $2, $3)`,
        [client.id, key, 'a'.repeat(64)],
      );
      const response = await lockedApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: {
          authorization: client.authorization,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        payload: '{}',
      });
      expectErrorBody(response, {
        status: 503,
        code: 'busy',
        message: 'The service is busy. Retry with the same Idempotency-Key.',
      });
      expect(response.headers['retry-after']).toBe('1');
    } finally {
      await lockedApp.close();
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
      await lockPool.end();
    }
  });

  it('hides an unknown database error over HTTP', async () => {
    const key = `db-error-${randomUUID().slice(0, 8)}`;
    const errorApp = await buildTestApp({
      logs: true,
      routes: (candidate) => {
        candidate.post(routePath, { config: { access: 'ledger:write' } }, (request, reply) =>
          runIdempotent(request, reply, errorApp.pool, async (tx) => {
            await tx.query('SELECT 1 / 0');
            return { status: 201, body: { ok: true } };
          }),
        );
      },
    });
    try {
      const response = await errorApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: {
          authorization: client.authorization,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        payload: '{}',
      });
      expectErrorBody(response, {
        status: 500,
        code: 'internal_error',
        message: 'Something went wrong',
      });
      expect(response.body).not.toContain('division');
      expect(response.body).not.toContain('SELECT');
      const rows = await errorApp.pool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM idempotency_keys WHERE client_id = $1 AND key = $2',
        [client.id, key],
      );
      expect(rows.rows[0]?.count).toBe(0);
      expect(errorApp.logs()).toContain('division by zero');
    } finally {
      await errorApp.close();
    }
  });

  it('replays the same JSON value', async () => {
    const key = uniqueKey();
    const first = await request({ nested: { unicode: '€' }, array: [1, 'two'] }, key);
    const second = await request({ nested: { unicode: '€' }, array: [1, 'two'] }, key);
    expect(second.json()).toEqual(first.json());
  });

  it('never leaks a connection', async () => {
    const leakPool = new pg.Pool({
      connectionString: testUrls().app,
      max: 2,
      connectionTimeoutMillis: 500,
    });
    const leakApp = await buildTestApp({
      pool: leakPool,
      routes: (candidate) => {
        candidate.post<{ Body: Record<string, unknown> }>(
          routePath,
          { config: { access: 'ledger:write' } },
          (request, reply) =>
            runIdempotent(request, reply, leakPool, async (tx) => {
              const body = request.body;
              await tx.query(
                `INSERT INTO ${effectsTable} (request_key, body)
                 VALUES ($1, $2::jsonb)`,
                [request.headers['idempotency-key'], JSON.stringify(body ?? null)],
              );
              if (body !== null && typeof body === 'object' && body.fail === true) {
                throw new ApiError(422, 'invalid_request', 'forced test failure');
              }
              if (body !== null && typeof body === 'object' && body.unexpected === true) {
                throw new Error('forced test failure');
              }
              if (body !== null && typeof body === 'object' && body.dbError === true) {
                await tx.query('SELECT 1 / 0');
              }
              return { status: 201, body: { accepted: body ?? null } };
            }),
        );
      },
    });
    try {
      const cyclePrefix = uniqueKey();
      for (let index = 0; index < 100; index += 1) {
        const cycle = index % 6;
        const key =
          cycle <= 2
            ? `${cyclePrefix}-${String(index - (index % 6)).padStart(5, '0')}`
            : `${cyclePrefix}-${String(index).padStart(5, '0')}`;
        const body =
          cycle === 0
            ? { value: index }
            : cycle === 1
              ? { value: index - 1 }
              : cycle === 2
                ? { value: 'different' }
                : cycle === 3
                  ? { fail: true }
                  : cycle === 4
                    ? { unexpected: true }
                    : { dbError: true };
        const response = await leakApp.app.inject({
          method: 'POST',
          url: routePath,
          headers: {
            authorization: client.authorization,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          payload: JSON.stringify(body),
        });
        if (cycle === 0 || cycle === 1) {
          expect(response.statusCode).toBe(201);
        } else if (cycle === 2) {
          expect(response.statusCode).toBe(409);
        } else if (cycle === 3) {
          expect(response.statusCode).toBe(422);
        } else {
          expect(response.statusCode).toBe(500);
        }
        if ((index + 1) % 10 === 0) {
          expect(leakPool.totalCount - leakPool.idleCount).toBe(0);
        }
      }
    } finally {
      await leakApp.close();
      await leakPool.end();
    }
  });

  it('uses a single connection per request', async () => {
    let enteredRun!: () => void;
    const insideRun = new Promise<void>((resolve) => {
      enteredRun = resolve;
    });
    const responsePromise = withIdempotency({
      pool: testApp.pool,
      client,
      key: uniqueKey(),
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
    const key = `unauth-${randomUUID().slice(0, 8)}`;
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
        headers: { 'idempotency-key': key },
        payload: '{}',
      });
      expectErrorBody(response, { status: 401, code: 'unauthorized' });
      const rows = await testApp.pool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM idempotency_keys WHERE key = $1',
        [key],
      );
      expect(rows.rows[0]?.count).toBe(0);
    } finally {
      await testApp.close();
    }
  });

  it('forbids a replay after the client lost its scope', async () => {
    const scopeChangingClient = await createTestClient({ scopes: ['ledger:write'] });
    const key = `scope-${randomUUID().slice(0, 8)}`;
    const testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.post(routePath, { config: { access: 'ledger:write' } }, (request, reply) =>
          runIdempotent(request, reply, testApp.pool, async (tx) => {
            await tx.query(
              `INSERT INTO ${effectsTable} (request_key, body)
               VALUES ($1, '{}'::jsonb)`,
              [request.headers['idempotency-key']],
            );
            return { status: 201, body: { ok: true } };
          }),
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
          'idempotency-key': key,
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
          'idempotency-key': key,
        },
        payload: '{}',
      });
      expectErrorBody(replay, { status: 403, code: 'forbidden' });
      const keyRows = await testApp.pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM idempotency_keys
          WHERE client_id = $1 AND key = $2`,
        [scopeChangingClient.id, key],
      );
      expect(keyRows.rows[0]?.count).toBe(1);
      expect(await countEffects(testApp.pool, key)).toBe(1);
    } finally {
      await testApp.close();
      await scopeChangingClient.remove();
    }
  });

  it('refuses a replay after the client was revoked', async () => {
    const revokedClient = await createTestClient({ scopes: ['ledger:write'] });
    const key = `revoked-${randomUUID().slice(0, 8)}`;
    const testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.post(routePath, { config: { access: 'ledger:write' } }, (request, reply) =>
          runIdempotent(request, reply, testApp.pool, async (tx) => {
            await tx.query(
              `INSERT INTO ${effectsTable} (request_key, body)
               VALUES ($1, '{}'::jsonb)`,
              [request.headers['idempotency-key']],
            );
            return { status: 201, body: { ok: true } };
          }),
        );
      },
    });
    try {
      const first = await testApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: {
          authorization: revokedClient.authorization,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        payload: '{}',
      });
      expect(first.statusCode).toBe(201);
      expect(await countEffects(testApp.pool, key)).toBe(1);
      await revokedClient.revoke();
      const replay = await testApp.app.inject({
        method: 'POST',
        url: routePath,
        headers: {
          authorization: revokedClient.authorization,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        payload: '{}',
      });

      expectErrorBody(replay, { status: 401, code: 'unauthorized', message: 'Unauthorized' });
      expect(await countEffects(testApp.pool, key)).toBe(1);
    } finally {
      await testApp.close();
      await revokedClient.remove();
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
    let called = false;
    const postWithoutClient = { method: 'POST', client: undefined } as never;
    await expect(
      runIdempotent(postWithoutClient, reply, {} as never, () => {
        called = true;
        return Promise.resolve({ status: 200, body: {} });
      }),
    ).rejects.toThrow('request client is required');
    expect(called).toBe(false);
  });
});

afterAll(async () => {
  await owner.query(`DROP TABLE ${effectsTable}`);
  await owner.end();
  await closeTestDb();
});
