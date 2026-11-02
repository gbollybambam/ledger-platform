import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '../../src/auth/keys.js';
import type { Scope } from '../../src/auth/types.js';
import { testUrls } from './db.js';

export interface TestClient {
  id: string;
  name: string;
  key: string;
  scopes: Scope[];
  authorization: string;
  revoke(): Promise<void>;
  remove(): Promise<void>;
}

let migrator: pg.Client | undefined;
let migratorPromise: Promise<pg.Client> | undefined;
let queryChain = Promise.resolve();

async function getMigrator(): Promise<pg.Client> {
  if (migrator !== undefined) {
    return migrator;
  }
  if (migratorPromise === undefined) {
    const client = new pg.Client({
      connectionString: testUrls().migrator,
      application_name: 'ledger-test-helper',
    });
    migratorPromise = client.connect().then(() => {
      migrator = client;
      return client;
    });
  }
  return migratorPromise;
}

function randomTestName(): string {
  return `t-${randomBytes(4).toString('hex')}`;
}

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<T>> {
  const result = queryChain.then(async () => (await getMigrator()).query<T>(text, values));
  queryChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function createTestClient(options?: {
  scopes?: Scope[];
  name?: string;
}): Promise<TestClient> {
  const id = randomUUID();
  const name = options?.name ?? randomTestName();
  const key = generateApiKey();
  const scopes = options?.scopes ?? ['ledger:read'];

  await query(
    `INSERT INTO clients (id, name, key_prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, apiKeyPrefix(key), hashApiKey(key), scopes],
  );

  return {
    id,
    name,
    key,
    scopes,
    authorization: `Bearer ${key}`,
    revoke: async () => {
      await query(
        `UPDATE clients
            SET status = 'revoked', revoked_at = now()
          WHERE id = $1 AND status = 'active'`,
        [id],
      );
    },
    remove: async () => {
      await query('DELETE FROM clients WHERE id = $1', [id]);
    },
  };
}

export async function withTestClient<T>(
  options: { scopes?: Scope[]; name?: string },
  fn: (client: TestClient) => Promise<T>,
): Promise<T> {
  const client = await createTestClient(options);
  try {
    return await fn(client);
  } finally {
    await client.remove();
  }
}

export async function closeTestDb(): Promise<void> {
  if (migratorPromise !== undefined) {
    const client = await migratorPromise;
    migrator = undefined;
    migratorPromise = undefined;
    await client.end();
  }
}
