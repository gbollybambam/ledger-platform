import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb } from './helpers/clients.js';
import { createTestPool, testUrls } from './helpers/db.js';

const PERMISSION_DENIED = '42501';

async function databaseError(
  promise: Promise<unknown>,
): Promise<{ code: string | undefined; constraint: string | undefined }> {
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

describe('currencies database protections', () => {
  let app: pg.Pool;
  let migrator: pg.Client;

  beforeAll(async () => {
    app = createTestPool();
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
  });

  afterAll(async () => {
    await app.end();
    await migrator.end();
    await closeTestDb();
  });

  it('seeds exactly the seven currencies', async () => {
    const { rows } = await app.query<{ code: string; minor_exponent: number }>(
      `SELECT code, minor_exponent
         FROM currencies
        ORDER BY code`,
    );

    expect(rows).toEqual([
      { code: 'EUR', minor_exponent: 2 },
      { code: 'GBP', minor_exponent: 2 },
      { code: 'GHS', minor_exponent: 2 },
      { code: 'KES', minor_exponent: 2 },
      { code: 'NGN', minor_exponent: 2 },
      { code: 'USD', minor_exponent: 2 },
      { code: 'ZAR', minor_exponent: 2 },
    ]);
  });

  it('currencies are read-only for the app', async () => {
    await expect(app.query('SELECT code FROM currencies')).resolves.toBeDefined();

    expect(
      await databaseError(
        app.query(`INSERT INTO currencies (code, minor_exponent)
                                          VALUES ('XXX', 2)`),
      ),
    ).toEqual({
      code: PERMISSION_DENIED,
      constraint: undefined,
    });
    expect(
      await databaseError(
        app.query(`UPDATE currencies
                                             SET minor_exponent = 3
                                           WHERE code = 'USD'`),
      ),
    ).toEqual({
      code: PERMISSION_DENIED,
      constraint: undefined,
    });
    expect(await databaseError(app.query(`DELETE FROM currencies WHERE code = 'USD'`))).toEqual({
      code: PERMISSION_DENIED,
      constraint: undefined,
    });
  });
});
