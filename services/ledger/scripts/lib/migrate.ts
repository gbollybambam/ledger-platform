import { runner } from 'node-pg-migrate';

export interface MigrateOptions {
  databaseUrl: string;
  dir: string;
  /** Tracking table. Tests use a separate one so they never touch the real history. */
  migrationsTable?: string;
}

/**
 * Applies all pending migrations in ONE database transaction, under an advisory
 * lock. If any migration fails, none of them is applied.
 */
export async function runMigrations(options: MigrateOptions): Promise<string[]> {
  const applied = await runner({
    databaseUrl: options.databaseUrl,
    dir: options.dir,
    direction: 'up',
    migrationsTable: options.migrationsTable ?? 'pgmigrations',
    checkOrder: true,
    singleTransaction: true,
    verbose: false,
    log: () => undefined,
  });
  return applied.map((m) => m.name);
}
