import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/lib/migrate.js';
import { testUrls } from './helpers/db.js';

const TRACKING_TABLE = 'pgmigrations_scratch';

describe('migration runner', () => {
  const urls = testUrls();
  let migrator: pg.Client;
  const dirs: string[] = [];

  function makeDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'ledger-migrations-'));
    dirs.push(dir);
    for (const [name, sql] of Object.entries(files)) {
      writeFileSync(join(dir, name), `-- Up Migration\n${sql}\n`);
    }
    return dir;
  }

  async function cleanup(): Promise<void> {
    await migrator.query(`DROP TABLE IF EXISTS scratch_a, scratch_b, ${TRACKING_TABLE}`);
  }

  beforeAll(async () => {
    migrator = new pg.Client({ connectionString: urls.migrator });
    await migrator.connect();
    await cleanup();
  });

  afterEach(cleanup);

  afterAll(async () => {
    await migrator.end();
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies pending migrations in order, and applies none the second time', async () => {
    const dir = makeDir({
      '1000_create-a.sql': 'CREATE TABLE scratch_a (id int);',
      '2000_create-b.sql': 'CREATE TABLE scratch_b (id int);',
    });
    const first = await runMigrations({
      databaseUrl: urls.migrator,
      dir,
      migrationsTable: TRACKING_TABLE,
    });
    expect(first).toEqual(['1000_create-a', '2000_create-b']);

    const second = await runMigrations({
      databaseUrl: urls.migrator,
      dir,
      migrationsTable: TRACKING_TABLE,
    });
    expect(second).toEqual([]);
  });

  it('applies nothing when one migration in the batch fails', async () => {
    const dir = makeDir({
      '1000_create-a.sql': 'CREATE TABLE scratch_a (id int);',
      '2000_broken.sql': 'THIS IS NOT SQL;',
    });
    await expect(
      runMigrations({ databaseUrl: urls.migrator, dir, migrationsTable: TRACKING_TABLE }),
    ).rejects.toThrow();

    const { rows } = await migrator.query<{ found: string | null }>(
      `SELECT to_regclass('scratch_a')::text AS found`,
    );
    expect(rows[0]?.found).toBeNull();
  });

  it('refuses migrations that run out of order', async () => {
    const dir = makeDir({ '2000_second.sql': 'CREATE TABLE scratch_b (id int);' });
    await runMigrations({ databaseUrl: urls.migrator, dir, migrationsTable: TRACKING_TABLE });

    // A new file that sorts BEFORE one that already ran must be rejected.
    writeFileSync(
      join(dir, '1000_first.sql'),
      '-- Up Migration\nCREATE TABLE scratch_a (id int);\n',
    );
    await expect(
      runMigrations({ databaseUrl: urls.migrator, dir, migrationsTable: TRACKING_TABLE }),
    ).rejects.toThrow(/preceding already run migration/i);
  });
});

describe('migration policy for the real migrations folder', () => {
  const dir = 'migrations';
  const files = readdirSync(dir).filter((f) => f !== '.gitkeep');

  it('only has well-named SQL files', () => {
    for (const file of files) {
      expect(file, `${file} must look like 1700000000000_what-it-does.sql`).toMatch(
        /^\d{10,}_[a-z0-9-]+\.sql$/,
      );
    }
  });

  it('is forward-only: no file has a "Down" section', () => {
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, `${file} must not contain a Down Migration`).not.toMatch(/--\s*Down Migration/i);
    }
  });

  it('is never edited after the fact (names are unique)', () => {
    const prefixes = files.map((f) => f.split('_')[0]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
