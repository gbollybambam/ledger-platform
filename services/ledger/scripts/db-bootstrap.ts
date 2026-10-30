import { bootstrapRoles } from './lib/bootstrap.js';

function need(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    process.stderr.write(`${name} is required\n`);
    process.exit(1);
  }
  return value;
}

await bootstrapRoles({
  adminUrl: need('ADMIN_DATABASE_URL'),
  migratorUrl: need('MIGRATION_DATABASE_URL'),
  appUrl: need('DATABASE_URL'),
});
process.stdout.write('database roles are ready\n');
