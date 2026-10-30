import { existsSync } from 'node:fs';

// Load .env for local runs. Variables already set (for example in CI) win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
