import { existsSync } from 'node:fs';
import { bootstrapRoles } from '../scripts/lib/bootstrap.js';
import { runMigrations } from '../scripts/lib/migrate.js';
import { testUrls } from './helpers/db.js';

/**
 * Runs once before all tests. It prepares the test database the same way an
 * operator prepares a real one: create roles, then apply migrations.
 */
export default async function setup(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const urls = testUrls();
  await bootstrapRoles({ adminUrl: urls.admin, migratorUrl: urls.migrator, appUrl: urls.app });
  await runMigrations({ databaseUrl: urls.migrator, dir: 'migrations' });
}
