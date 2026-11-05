import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/app.js';
import { closeTestDb, createTestClient, type TestClient } from './helpers/clients.js';
import { expectErrorBody } from './helpers/http.js';
import { testUrls } from './helpers/db.js';
import { KNOWN_FIELDS } from '../src/http/validation.js';
import {
  accountIdSchema,
  createAccountSchema,
  findAccountsSchema,
} from '../src/accounts/schemas.js';

const key = () => `f3-${randomUUID()}`;
const validBody = () => ({
  name: `Wallet ${randomUUID()}`,
  kind: 'liability',
  currency: 'USD',
  allow_negative: false,
});

async function request(
  testApp: TestApp,
  client: TestClient,
  payload: object | string | undefined,
  headers: Record<string, string> = {},
) {
  return testApp.app.inject({
    method: 'POST',
    url: '/v1/accounts',
    headers: {
      authorization: client.authorization,
      'idempotency-key': key(),
      ...headers,
    },
    payload: payload === null ? undefined : payload,
  });
}

describe('accounts validation', () => {
  let testApp: TestApp;
  let client: TestClient;

  beforeAll(async () => {
    testApp = await buildTestApp({ logs: true });
    client = await createTestClient({ scopes: ['ledger:read', 'ledger:write'] });
  });

  afterAll(async () => {
    const migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    await migrator.query('ALTER TABLE accounts DISABLE TRIGGER accounts_are_never_deleted');
    await migrator.query('DELETE FROM accounts WHERE client_id = $1', [client.id]);
    await migrator.query('ALTER TABLE accounts ENABLE TRIGGER accounts_are_never_deleted');
    await migrator.end();
    await client.remove();
    await testApp.close();
    await closeTestDb();
  });

  it('refuses wrong types', async () => {
    for (const body of [
      { ...validBody(), name: 123 },
      { ...validBody(), allow_negative: 'false' },
      { ...validBody(), kind: 123 },
    ]) {
      expectErrorBody(await request(testApp, client, body), {
        status: 400,
        code: 'invalid_request',
        message:
          'Request is not valid: ' +
          (typeof body.name === 'number'
            ? 'name'
            : typeof body.kind === 'number'
              ? 'kind'
              : 'allow_negative'),
      });
    }
  });

  it('refuses incomplete bodies', async () => {
    for (const body of [
      { kind: 'liability', currency: 'USD' },
      { name: 'Wallet', currency: 'USD' },
      { name: 'Wallet', kind: 'liability' },
      {},
      undefined,
      [],
    ]) {
      expectErrorBody(await request(testApp, client, body), {
        status: 400,
        code: 'invalid_request',
      });
    }
  });

  it('field boundaries', async () => {
    for (const name of ['A', 'x'.repeat(120), '😀'.repeat(120)]) {
      expect((await request(testApp, client, { ...validBody(), name })).statusCode).toBe(201);
    }
    for (const name of [
      '',
      'x'.repeat(121),
      '😀'.repeat(121),
      ' leading',
      'trailing ',
      '\t',
      '\n',
      `a${String.fromCharCode(0xa0)}`,
    ]) {
      expectErrorBody(await request(testApp, client, { ...validBody(), name }), {
        status: 400,
        code: 'invalid_request',
      });
    }
    for (const external_id of ['x', 'x'.repeat(128)]) {
      expect((await request(testApp, client, { ...validBody(), external_id })).statusCode).toBe(
        201,
      );
    }
    for (const external_id of ['x'.repeat(129), 'has space', 'has/slash', 'has-é']) {
      expectErrorBody(await request(testApp, client, { ...validBody(), external_id }), {
        status: 400,
        code: 'invalid_request',
      });
    }
    for (const currency of ['usd', 'US', 'USDD']) {
      expectErrorBody(await request(testApp, client, { ...validBody(), currency }), {
        status: 400,
        code: 'invalid_request',
      });
    }
    expectErrorBody(await request(testApp, client, { ...validBody(), kind: 'other' }), {
      status: 400,
      code: 'invalid_request',
    });
  });

  it('refuses malformed JSON', async () => {
    for (const payload of ['{"name":', '', '{"__proto__":true}', '{"constructor":true}']) {
      const response = await request(testApp, client, payload, {
        'content-type': 'application/json',
      });
      expectErrorBody(response, {
        status: 400,
        code: 'invalid_request',
        message: 'Request is not valid',
      });
    }
  });

  it('content types', async () => {
    expectErrorBody(
      await request(testApp, client, JSON.stringify(validBody()), { 'content-type': 'text/plain' }),
      { status: 400, code: 'invalid_request' },
    );
    expectErrorBody(
      await request(testApp, client, '<xml/>', { 'content-type': 'application/xml' }),
      { status: 415, code: 'unsupported_media_type', message: 'Unsupported content type' },
    );
    expectErrorBody(
      await request(testApp, client, JSON.stringify(validBody()), { 'content-type': '' }),
      { status: 415, code: 'unsupported_media_type' },
    );
    expect(
      (
        await request(testApp, client, validBody(), {
          'content-type': 'application/json; charset=utf-8',
        })
      ).statusCode,
    ).toBe(201);
  });

  it('refuses bad queries', async () => {
    const cases = [
      '/v1/accounts',
      '/v1/accounts?external_id=a&external_id=b',
      '/v1/accounts?external_id=a&extra=b',
      '/v1/accounts?external_id=has%20space',
      '/v1/accounts?external_id=a&client=BAD',
    ];
    for (const url of cases) {
      expectErrorBody(
        await testApp.app.inject({
          method: 'GET',
          url,
          headers: { authorization: client.authorization },
        }),
        { status: 400, code: 'invalid_request' },
      );
    }
  });

  it('KNOWN_FIELDS matches the schemas', () => {
    const fields = new Set([
      ...Object.keys(createAccountSchema.body.properties),
      ...Object.keys(accountIdSchema.params.properties),
      ...Object.keys(findAccountsSchema.querystring.properties),
    ]);
    expect([...fields].sort()).toEqual([...KNOWN_FIELDS].sort());
  });
});
