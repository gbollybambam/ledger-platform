import { afterAll, beforeAll, describe, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';
import { buildTestApp, type TestApp } from './helpers/app.js';
import { closeTestDb, createTestClient, type TestClient } from './helpers/clients.js';
import { createTestPool } from './helpers/db.js';
import { testUrls } from './helpers/db.js';

const body = (external_id?: string) => ({
  name: `Concurrent ${randomUUID()}`,
  kind: 'liability',
  currency: 'USD',
  allow_negative: false,
  ...(external_id === undefined ? {} : { external_id }),
});

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

describe('accounts concurrency', () => {
  let pool: pg.Pool;
  let testApp!: TestApp;
  let client!: TestClient;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
    await testApp.close();
    await removeAccounts(client.id);
    await client.remove();
    await closeTestDb();
  });

  it('accounts concurrency', async () => {
    testApp = await buildTestApp({ pool });
    client = await createTestClient({ scopes: ['ledger:write'] });
    const create = (payload: Record<string, unknown>, key: string) =>
      testApp.app.inject({
        method: 'POST',
        url: '/v1/accounts',
        headers: { authorization: client.authorization, 'idempotency-key': key },
        payload,
      });

    const sameKeyBody = body(`same-${randomUUID()}`);
    const sameKey = `f3-${randomUUID()}`;
    const sameKeyResponses = await Promise.all(
      Array.from({ length: 50 }, () => create(sameKeyBody, sameKey)),
    );
    expect(sameKeyResponses.map((response) => response.statusCode)).toEqual(
      expect.arrayContaining([201]),
    );
    expect(sameKeyResponses.every((response) => response.statusCode === 201)).toBe(true);
    expect(
      new Set(sameKeyResponses.map((response) => response.json<{ id: string }>().id)).size,
    ).toBe(1);

    const sameExternal = `race-${randomUUID()}`;
    const duplicateResponses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        create(body(sameExternal), `f3-${randomUUID()}-${index}`),
      ),
    );
    expect(duplicateResponses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(duplicateResponses.filter((response) => response.statusCode === 409)).toHaveLength(19);
    expect(duplicateResponses.some((response) => response.statusCode >= 500)).toBe(false);

    const distinctResponses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        create(body(`distinct-${randomUUID()}-${index}`), `f3-${randomUUID()}-${index}`),
      ),
    );
    expect(distinctResponses.every((response) => response.statusCode === 201)).toBe(true);
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM accounts WHERE client_id = $1',
      [client.id],
    );
    expect(rows[0]?.count).toBe('22');
  }, 30_000);
});
