import { createPool } from '../../src/db/pool.js';

function need(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. Run \`npm run db:up\`, then copy .env.example to .env.`);
  }
  return value;
}

/** The three test database connections. See .env.example for what each role is for. */
export function testUrls() {
  return {
    admin: need('TEST_ADMIN_DATABASE_URL'),
    migrator: need('TEST_MIGRATION_DATABASE_URL'),
    app: need('TEST_DATABASE_URL'),
  };
}

/** A pool that connects as the limited app role, like the running service. */
export function createTestPool() {
  return createPool(testUrls().app);
}
