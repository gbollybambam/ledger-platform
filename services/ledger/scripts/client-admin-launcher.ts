import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const envFileArgs = existsSync('.env') ? ['--env-file=.env'] : [];
const child = spawn(
  process.execPath,
  ['--import', 'tsx/esm', ...envFileArgs, 'scripts/client-admin.ts', ...process.argv.slice(2)],
  {
    env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
    stdio: 'inherit',
  },
);

child.on('close', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
