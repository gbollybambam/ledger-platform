import { buildApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import { createPool } from './db/pool.js';

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const pool = createPool(config.databaseUrl);
const app = buildApp({
  pool,
  logger: { level: config.appEnv === 'production' ? 'info' : 'debug' },
});

// An idle database connection can fail. Log it instead of crashing.
pool.on('error', (err) => {
  app.log.error({ err }, 'idle database client error');
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  await pool.end();
  process.exit(1);
}
