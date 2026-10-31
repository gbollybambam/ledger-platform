import { runClientAdmin } from './lib/client-admin.js';

const exitCode = await runClientAdmin(process.argv.slice(2), {
  databaseUrl: process.env.MIGRATION_DATABASE_URL,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

process.exitCode = exitCode;
