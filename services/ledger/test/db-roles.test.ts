import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../scripts/lib/bootstrap.js';
import { createTestPool, testUrls } from './helpers/db.js';

const PERMISSION_DENIED = '42501';

async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('database roles (least privilege)', () => {
  let app: pg.Pool;
  const urls = testUrls();
  const migratorName = decodeURIComponent(new URL(urls.migrator).username);
  const appName = decodeURIComponent(new URL(urls.app).username);

  beforeAll(() => {
    app = createTestPool();
  });

  afterAll(async () => {
    await app.end();
  });

  it('the app role is not a superuser and cannot create roles or databases', async () => {
    const { rows } = await app.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
         FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolbypassrls: false,
    });
  });

  it('the app role cannot create tables', async () => {
    expect(await sqlState(app.query('CREATE TABLE should_not_exist (id int)'))).toBe(
      PERMISSION_DENIED,
    );
  });

  it('the app role cannot create temporary tables', async () => {
    expect(await sqlState(app.query('CREATE TEMP TABLE should_not_exist (id int)'))).toBe(
      PERMISSION_DENIED,
    );
  });

  it('the app role cannot read or change the migration history', async () => {
    expect(await sqlState(app.query('SELECT * FROM pgmigrations'))).toBe(PERMISSION_DENIED);
    expect(await sqlState(app.query('DELETE FROM pgmigrations'))).toBe(PERMISSION_DENIED);
  });

  it('the migrator role owns the database and the migration history', async () => {
    const { rows } = await app.query<{ owner: string }>(
      `SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = current_database()`,
    );
    expect(rows[0]?.owner).toBe(migratorName);

    const table = await app.query<{ owner: string }>(
      `SELECT tableowner AS owner FROM pg_tables WHERE tablename = 'pgmigrations'`,
    );
    expect(table.rows[0]?.owner).toBe(migratorName);
  });

  it('PUBLIC cannot connect to the database', async () => {
    const { rows } = await app.query<{ acl: string }>(
      `SELECT datacl::text AS acl FROM pg_database WHERE datname = current_database()`,
    );
    // An entry that starts with "=" would mean PUBLIC has privileges.
    expect(rows[0]?.acl).not.toMatch(/[{,]=/);
  });

  it('the role defaults set the time limits', async () => {
    const { rows } = await app.query<{ rolconfig: string[] }>(
      `SELECT rolconfig FROM pg_roles WHERE rolname = $1`,
      [appName],
    );
    expect(rows[0]?.rolconfig).toEqual(
      expect.arrayContaining([
        'statement_timeout=10000',
        'lock_timeout=5000',
        'idle_in_transaction_session_timeout=15000',
        'transaction_timeout=20000',
      ]),
    );
  });

  it('bootstrap is safe to run again', async () => {
    await expect(
      bootstrapRoles({ adminUrl: urls.admin, migratorUrl: urls.migrator, appUrl: urls.app }),
    ).resolves.toBeUndefined();
  });

  it('bootstrap refuses to use one role for both jobs', async () => {
    await expect(
      bootstrapRoles({ adminUrl: urls.admin, migratorUrl: urls.app, appUrl: urls.app }),
    ).rejects.toThrow(/must be different/);
  });
});
