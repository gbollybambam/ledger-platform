import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers/app.js';
import { closeTestDb, createTestClient, type TestClient } from './helpers/clients.js';
import { expectErrorBody } from './helpers/http.js';

let client: TestClient;

describe('error format', () => {
  let app: FastifyInstance;
  let testApp: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    client = await createTestClient();
    testApp = await buildTestApp({
      routes: (candidate) => {
        candidate.get('/v1/boom', { config: { access: 'any-client' } }, () => {
          throw new Error('secret internal detail');
        });
      },
    });
    app = testApp.app;
  });

  afterAll(async () => {
    await testApp.close();
    await client.remove();
    await closeTestDb();
  });

  it('returns the standard body for an unknown route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { authorization: client.authorization },
    });
    expectErrorBody(res, { status: 404, code: 'not_found', message: 'Route not found' });
  });

  it('hides internal details on a 500', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/boom',
      headers: { authorization: client.authorization },
    });
    expectErrorBody(res, { status: 500, code: 'internal_error' });
    expect(res.body).not.toContain('secret internal detail');
  });
});
