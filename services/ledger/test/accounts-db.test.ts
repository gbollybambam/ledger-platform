import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, createTestClient, type TestClient } from './helpers/clients.js';
import { createTestPool, testUrls } from './helpers/db.js';

const PERMISSION_DENIED = '42501';
const INTEGRITY_CONSTRAINT_VIOLATION = '23000';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

type AccountKind = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
type NormalBalance = 'debit' | 'credit';

interface DatabaseError {
  code: string | undefined;
  constraint: string | undefined;
}

async function databaseError(promise: Promise<unknown>): Promise<DatabaseError> {
  try {
    await promise;
    return { code: undefined, constraint: undefined };
  } catch (error) {
    if (typeof error !== 'object' || error === null) {
      return { code: undefined, constraint: undefined };
    }
    const databaseError = error as { code?: unknown; constraint?: unknown };
    return {
      code: typeof databaseError.code === 'string' ? databaseError.code : undefined,
      constraint:
        typeof databaseError.constraint === 'string' ? databaseError.constraint : undefined,
    };
  }
}

async function insertAccount(
  migrator: pg.Client,
  clientId: string,
  options: {
    id?: string;
    name?: string;
    kind?: AccountKind;
    normalBalance?: NormalBalance;
    currency?: string;
    allowNegative?: boolean;
    externalId?: string | null;
    debitsTotal?: bigint;
    creditsTotal?: bigint;
  } = {},
): Promise<string> {
  const id = options.id ?? randomUUID();
  await migrator.query(
    `INSERT INTO accounts
       (id, client_id, name, kind, normal_balance, currency, allow_negative,
        external_id, debits_total, credits_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      clientId,
      options.name ?? `Account ${id}`,
      options.kind ?? 'asset',
      options.normalBalance ?? 'debit',
      options.currency ?? 'USD',
      options.allowNegative ?? false,
      options.externalId ?? null,
      options.debitsTotal ?? 0n,
      options.creditsTotal ?? 0n,
    ],
  );
  return id;
}

async function accountColumn(
  migrator: pg.Client,
  id: string,
  column: string,
  value: unknown,
): Promise<DatabaseError> {
  return databaseError(
    migrator.query(`UPDATE accounts SET ${column} = $1 WHERE id = $2`, [value, id]),
  );
}

describe('accounts database protections', () => {
  let app: pg.Pool;
  let migrator: pg.Client;
  let fixture: TestClient;

  beforeAll(async () => {
    app = createTestPool();
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    fixture = await createTestClient({ scopes: ['ledger:read', 'ledger:write'] });
  });

  afterAll(async () => {
    await app.end();
    await migrator.end();
    await closeTestDb();
  });

  it('normal balance follows the kind', async () => {
    const rightPairs: Array<[AccountKind, NormalBalance]> = [
      ['asset', 'debit'],
      ['expense', 'debit'],
      ['liability', 'credit'],
      ['equity', 'credit'],
      ['revenue', 'credit'],
    ];
    for (const [kind, normalBalance] of rightPairs) {
      await expect(insertAccount(migrator, fixture.id, { kind, normalBalance })).resolves.toMatch(
        /^[0-9a-f-]{36}$/,
      );
    }

    const wrongPairs: Array<[AccountKind, NormalBalance]> = [
      ['asset', 'credit'],
      ['expense', 'credit'],
      ['liability', 'debit'],
      ['equity', 'debit'],
      ['revenue', 'debit'],
    ];
    for (const [kind, normalBalance] of wrongPairs) {
      expect(
        await databaseError(insertAccount(migrator, fixture.id, { kind, normalBalance })),
      ).toEqual({ code: CHECK_VIOLATION, constraint: 'normal_balance_follows_kind' });
    }
  });

  it('only equity may allow negative', async () => {
    const equityId = await insertAccount(migrator, fixture.id, {
      kind: 'equity',
      normalBalance: 'credit',
      allowNegative: true,
    });
    expect(equityId).toMatch(/^[0-9a-f-]{36}$/);

    expect(
      await databaseError(
        insertAccount(migrator, fixture.id, {
          kind: 'liability',
          normalBalance: 'credit',
          allowNegative: true,
        }),
      ),
    ).toEqual({ code: CHECK_VIOLATION, constraint: 'negative_only_for_equity' });
  });

  it('account identity is final', async () => {
    const id = await insertAccount(migrator, fixture.id, {
      kind: 'liability',
      normalBalance: 'credit',
      externalId: `identity-${randomUUID()}`,
    });

    expect(
      await databaseError(app.query('UPDATE accounts SET name = name WHERE id = $1', [id])),
    ).toEqual({
      code: PERMISSION_DENIED,
      constraint: undefined,
    });

    const identityChanges: Array<[string, unknown]> = [
      ['client_id', randomUUID()],
      ['name', 'changed'],
      ['kind', 'equity'],
      ['normal_balance', 'debit'],
      ['currency', 'EUR'],
      ['allow_negative', true],
      ['external_id', `changed-${randomUUID()}`],
      ['created_at', new Date()],
    ];
    for (const [column, value] of identityChanges) {
      expect(await accountColumn(migrator, id, column, value)).toEqual({
        code: INTEGRITY_CONSTRAINT_VIOLATION,
        constraint: undefined,
      });
    }

    await expect(
      migrator.query('UPDATE accounts SET version = version + 1 WHERE id = $1', [id]),
    ).resolves.toBeDefined();
  });

  it('accounts are never deleted', async () => {
    const id = await insertAccount(migrator, fixture.id);

    expect(await databaseError(app.query('DELETE FROM accounts WHERE id = $1', [id]))).toEqual({
      code: PERMISSION_DENIED,
      constraint: undefined,
    });
    expect(await databaseError(migrator.query('DELETE FROM accounts WHERE id = $1', [id]))).toEqual(
      {
        code: INTEGRITY_CONSTRAINT_VIOLATION,
        constraint: undefined,
      },
    );
  });

  it('an account cannot start with a balance', async () => {
    for (const [column, value] of [
      ['debits_total', 1n],
      ['credits_total', 1n],
      ['version', 1n],
      ['created_at', new Date()],
    ] as const) {
      expect(
        await databaseError(
          app.query(
            `INSERT INTO accounts
              (id, client_id, name, kind, normal_balance, currency, ${column})
             VALUES ($1, $2, 'App account', 'asset', 'debit', 'USD', $3)`,
            [randomUUID(), fixture.id, value],
          ),
        ),
      ).toEqual({ code: PERMISSION_DENIED, constraint: undefined });
    }
  });

  it('field checks hold in the database', async () => {
    const validExternalId = 'x'.repeat(128);
    await insertAccount(migrator, fixture.id, { name: 'A', externalId: validExternalId });

    for (const name of ['', 'x'.repeat(121), ' leading', 'trailing ', '\t', '\n']) {
      expect(await databaseError(insertAccount(migrator, fixture.id, { name }))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'accounts_name_check',
      });
    }
    for (const externalId of ['x'.repeat(129), 'has space', 'has/slash', 'has-é']) {
      expect(await databaseError(insertAccount(migrator, fixture.id, { externalId }))).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'accounts_external_id_check',
      });
    }
  });

  it('external_id is unique per client', async () => {
    const externalId = `duplicate-${randomUUID()}`;
    await insertAccount(migrator, fixture.id, { externalId });
    expect(await databaseError(insertAccount(migrator, fixture.id, { externalId }))).toEqual({
      code: UNIQUE_VIOLATION,
      constraint: 'accounts_client_id_external_id_key',
    });

    const otherClient = await createTestClient({ scopes: ['ledger:read', 'ledger:write'] });
    await expect(insertAccount(migrator, otherClient.id, { externalId })).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await expect(insertAccount(migrator, fixture.id, { externalId: null })).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await expect(insertAccount(migrator, fixture.id, { externalId: null })).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('currency must be on the allow-list', async () => {
    expect(await databaseError(insertAccount(migrator, fixture.id, { currency: 'XXX' }))).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      constraint: 'accounts_currency_fkey',
    });
  });

  it('no_overdraft holds on accounts', async () => {
    const liabilityId = await insertAccount(migrator, fixture.id, {
      kind: 'liability',
      normalBalance: 'credit',
    });
    expect(
      await databaseError(
        migrator.query('UPDATE accounts SET debits_total = 1 WHERE id = $1', [liabilityId]),
      ),
    ).toEqual({ code: CHECK_VIOLATION, constraint: 'no_overdraft' });

    const equityId = await insertAccount(migrator, fixture.id, {
      kind: 'equity',
      normalBalance: 'credit',
      allowNegative: true,
    });
    await expect(
      migrator.query('UPDATE accounts SET debits_total = 1 WHERE id = $1', [equityId]),
    ).resolves.toBeDefined();
  });
});
