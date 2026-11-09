import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';
import { closeTestDb, createTestClient, type TestClient } from './helpers/clients.js';
import { testUrls } from './helpers/db.js';
import { expectErrorBody } from './helpers/http.js';

interface Account {
  id: string;
  client_id: string;
  name: string;
  kind: string;
  normal_balance: string;
  currency: string;
  allow_negative: boolean;
  external_id: string | null;
  created_at: string;
}

const accountBody = (overrides: Record<string, unknown> = {}) => ({
  name: `Wallet ${randomUUID()}`,
  kind: 'liability',
  currency: 'USD',
  allow_negative: false,
  ...overrides,
});

async function createAccount(
  testApp: TestApp,
  client: TestClient,
  body: Record<string, unknown> = accountBody(),
  key = `f3-${randomUUID()}`,
) {
  return testApp.app.inject({
    method: 'POST',
    url: '/v1/accounts',
    headers: { authorization: client.authorization, 'idempotency-key': key },
    payload: body,
  });
}

async function removeAccounts(clientId: string): Promise<void> {
  const migrator = new pg.Client({ connectionString: testUrls().migrator });
  await migrator.connect();
  try {
    await migrator.query('ALTER TABLE accounts DISABLE TRIGGER accounts_are_never_deleted');
    await migrator.query('DELETE FROM accounts WHERE client_id = $1', [clientId]);
    await migrator.query('ALTER TABLE accounts ENABLE TRIGGER accounts_are_never_deleted');
  } finally {
    await migrator.end();
  }
}

describe('accounts API', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp({ logs: true });
  });

  afterAll(async () => {
    await testApp.close();
    await closeTestDb();
  });

  it('derives the normal balance for each kind', async () => {
    const client = await createTestClient({ scopes: ['ledger:write', 'ledger:read'] });
    try {
      const expected = new Map([
        ['asset', 'debit'],
        ['expense', 'debit'],
        ['liability', 'credit'],
        ['equity', 'credit'],
        ['revenue', 'credit'],
      ]);
      for (const [kind, normalBalance] of expected) {
        const response = await createAccount(testApp, client, accountBody({ kind }));
        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({ kind, normal_balance: normalBalance });
      }
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('refuses unknown fields', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      for (const body of [
        { ...accountBody(), normal_balance: 'debit' },
        { ...accountBody(), id: randomUUID() },
        { ...accountBody(), unexpected: 'value' },
      ]) {
        const response = await createAccount(testApp, client, body);
        expectErrorBody(response, {
          status: 400,
          code: 'invalid_request',
          message: 'Request is not valid',
        });
      }
    } finally {
      await client.remove();
    }
  });

  it('never echoes client text', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    const canary = `canary-${randomUUID()}`;
    try {
      const responses = [
        await createAccount(testApp, client, { ...accountBody(), name: 123, value: canary }),
        await createAccount(testApp, client, { ...accountBody(), [canary]: true }),
        await testApp.app.inject({
          method: 'POST',
          url: '/v1/accounts',
          headers: {
            authorization: client.authorization,
            'idempotency-key': `f3-${randomUUID()}`,
            'content-type': 'application/json',
          },
          payload: `{"name":"${canary}"`,
        }),
      ];
      for (const response of responses) {
        expect(response.statusCode).toBe(400);
        expect(response.body).not.toContain(canary);
        expect(response.body).toContain('Request is not valid');
      }
      expect(testApp.logs()).not.toContain(canary);
    } finally {
      await client.remove();
    }
  });

  it('refuses an unknown currency', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      const response = await createAccount(testApp, client, accountBody({ currency: 'XXX' }));
      expectErrorBody(response, {
        status: 422,
        code: 'unknown_currency',
        message: 'Currency is not supported',
      });
    } finally {
      await client.remove();
    }
  });

  it('refuses negative balances outside equity', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      const refused = await createAccount(
        testApp,
        client,
        accountBody({ allow_negative: true, kind: 'liability' }),
      );
      expectErrorBody(refused, {
        status: 422,
        code: 'invalid_account',
        message: 'Only equity accounts may allow negative balances',
      });
      const accepted = await createAccount(
        testApp,
        client,
        accountBody({ allow_negative: true, kind: 'equity' }),
      );
      expect(accepted.statusCode).toBe(201);
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('refuses a duplicate external_id', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    const externalId = `external-${randomUUID()}`;
    try {
      expect(
        (await createAccount(testApp, client, accountBody({ external_id: externalId }))).statusCode,
      ).toBe(201);
      const duplicate = await createAccount(
        testApp,
        client,
        accountBody({ external_id: externalId }),
      );
      expectErrorBody(duplicate, {
        status: 409,
        code: 'external_id_conflict',
        message: 'An account with this external_id already exists',
      });
      const rows = await testApp.pool.query<{ count: string }>(
        'SELECT count(*) FROM accounts WHERE client_id = $1 AND external_id = $2',
        [client.id, externalId],
      );
      expect(rows.rows[0]?.count).toBe('1');
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('creating is idempotent', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      const key = `f3-${randomUUID()}`;
      const body = accountBody({ external_id: `idem-${randomUUID()}` });
      const first = await createAccount(testApp, client, body, key);
      const replay = await createAccount(testApp, client, body, key);
      const changed = await createAccount(testApp, client, { ...body, name: 'changed' }, key);
      expect(first.statusCode).toBe(201);
      expect(replay.statusCode).toBe(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.json()).toEqual(first.json());
      expectErrorBody(changed, {
        status: 409,
        code: 'idempotency_key_reused',
        message: 'This Idempotency-Key was used for a different request',
      });
      const rows = await testApp.pool.query<{ count: string }>(
        'SELECT count(*) FROM accounts WHERE client_id = $1',
        [client.id],
      );
      expect(rows.rows[0]?.count).toBe('1');
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('scopes are exact', async () => {
    const readOnly = await createTestClient({ scopes: ['ledger:read'] });
    const writeOnly = await createTestClient({ scopes: ['ledger:write'] });
    try {
      expectErrorBody(await createAccount(testApp, readOnly), {
        status: 403,
        code: 'forbidden',
        message: 'Forbidden',
      });
      for (const request of [
        { url: '/v1/currencies' },
        { url: `/v1/accounts/${randomUUID()}` },
        { url: `/v1/accounts?external_id=${encodeURIComponent(`x-${randomUUID()}`)}` },
      ]) {
        expectErrorBody(
          await testApp.app.inject({
            method: 'GET',
            url: request.url,
            headers: { authorization: writeOnly.authorization },
          }),
          { status: 403, code: 'forbidden', message: 'Forbidden' },
        );
      }
    } finally {
      await readOnly.remove();
      await writeOnly.remove();
    }
  });

  it('lookup is scoped to the caller by default', async () => {
    const first = await createTestClient({
      name: `first-${randomUUID().slice(0, 8)}`,
      scopes: ['ledger:read', 'ledger:write'],
    });
    const second = await createTestClient({
      name: `second-${randomUUID().slice(0, 8)}`,
      scopes: ['ledger:read', 'ledger:write'],
    });
    const externalId = `shared-${randomUUID()}`;
    try {
      const firstAccount = await createAccount(
        testApp,
        first,
        accountBody({ external_id: externalId }),
      );
      const secondAccount = await createAccount(
        testApp,
        second,
        accountBody({ external_id: externalId }),
      );
      const firstBody = firstAccount.json<Account>();
      const secondBody = secondAccount.json<Account>();
      const own = await testApp.app.inject({
        method: 'GET',
        url: `/v1/accounts?external_id=${externalId}`,
        headers: { authorization: first.authorization },
      });
      const other = await testApp.app.inject({
        method: 'GET',
        url: `/v1/accounts?external_id=${externalId}&client=${second.name}`,
        headers: { authorization: first.authorization },
      });
      const unknown = await testApp.app.inject({
        method: 'GET',
        url: `/v1/accounts?external_id=${externalId}&client=unknown-${randomUUID().slice(0, 8)}`,
        headers: { authorization: first.authorization },
      });
      expect(own.json()).toEqual({ data: [firstBody] });
      expect(other.json()).toEqual({ data: [secondBody] });
      expect(unknown.json()).toEqual({ data: [] });
    } finally {
      await removeAccounts(first.id);
      await removeAccounts(second.id);
      await first.remove();
      await second.remove();
    }
  });

  it('limits the body size', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      const body = JSON.stringify({ ...accountBody(), padding: 'x'.repeat(65_537) });
      expect(
        (
          await testApp.app.inject({
            method: 'POST',
            url: '/v1/accounts',
            headers: {
              authorization: client.authorization,
              'idempotency-key': `f3-${randomUUID()}`,
              'content-type': 'application/json',
            },
            payload: body,
          })
        ).statusCode,
      ).toBe(413);
      expectErrorBody(
        await testApp.app.inject({
          method: 'POST',
          url: '/v1/accounts',
          headers: { 'content-type': 'application/json', 'idempotency-key': `f3-${randomUUID()}` },
          payload: body,
        }),
        { status: 401, code: 'unauthorized', message: 'Unauthorized' },
      );
    } finally {
      await client.remove();
    }
  });

  it('records the creating client', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      const response = await createAccount(testApp, client);
      expect(response.json<Account>().client_id).toBe(client.id);
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('returns the exact account shape', async () => {
    const client = await createTestClient({ scopes: ['ledger:write'] });
    try {
      const response = await createAccount(
        testApp,
        client,
        accountBody({ external_id: undefined }),
      );
      expect(Object.keys(response.json<Account>()).sort()).toEqual([
        'allow_negative',
        'client_id',
        'created_at',
        'currency',
        'external_id',
        'id',
        'kind',
        'name',
        'normal_balance',
      ]);
      expect(response.json<Account>().external_id).toBeNull();
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('reads an account by id', async () => {
    const client = await createTestClient({ scopes: ['ledger:read', 'ledger:write'] });
    try {
      const created = await createAccount(testApp, client);
      const account = created.json<Account>();
      const found = await testApp.app.inject({
        method: 'GET',
        url: `/v1/accounts/${account.id.toUpperCase()}`,
        headers: { authorization: client.authorization },
      });
      expect(found.statusCode).toBe(200);
      expect(found.json()).toEqual(account);
      expectErrorBody(
        await testApp.app.inject({
          method: 'GET',
          url: `/v1/accounts/${randomUUID()}`,
          headers: { authorization: client.authorization },
        }),
        { status: 404, code: 'not_found', message: 'Account not found' },
      );
      expectErrorBody(
        await testApp.app.inject({
          method: 'GET',
          url: '/v1/accounts/not-a-uuid',
          headers: { authorization: client.authorization },
        }),
        { status: 400, code: 'invalid_request', message: 'Request is not valid: id' },
      );
    } finally {
      await removeAccounts(client.id);
      await client.remove();
    }
  });

  it('lists the currencies', async () => {
    const client = await createTestClient({ scopes: ['ledger:read'] });
    try {
      const response = await testApp.app.inject({
        method: 'GET',
        url: '/v1/currencies',
        headers: { authorization: client.authorization },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          { code: 'EUR', minor_exponent: 2 },
          { code: 'GBP', minor_exponent: 2 },
          { code: 'GHS', minor_exponent: 2 },
          { code: 'KES', minor_exponent: 2 },
          { code: 'NGN', minor_exponent: 2 },
          { code: 'USD', minor_exponent: 2 },
          { code: 'ZAR', minor_exponent: 2 },
        ],
      });
    } finally {
      await client.remove();
    }
  });

  it('documents accounts and currencies', () => {
    const spec = parse(readFileSync('openapi/ledger.v1.yaml', 'utf8')) as unknown as {
      paths: Record<
        string,
        Record<string, { operationId?: string; parameters?: Array<{ $ref?: string }> }>
      >;
      components: { schemas: Record<string, unknown> };
    };
    expect(spec.paths['/v1/accounts']?.post?.operationId).toBe('createAccount');
    expect(spec.paths['/v1/accounts']?.get?.operationId).toBe('findAccounts');
    expect(spec.paths['/v1/accounts/{id}']?.get?.operationId).toBe('getAccount');
    expect(spec.paths['/v1/currencies']?.get?.operationId).toBe('listCurrencies');
    expect(spec.paths['/v1/accounts']?.post?.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey',
    });
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining([
        'Account',
        'CreateAccountRequest',
        'AccountList',
        'Currency',
        'CurrencyList',
      ]),
    );
  });
});
