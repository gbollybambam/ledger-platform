import pg from 'pg';
import { DB_TIMEOUTS_MS } from './timeouts.js';

/**
 * Creates the one connection pool for the app. It connects as the limited
 * `ledger_app` role (see docs/decisions/0016). The connection timeout stops a
 * down database from hanging requests.
 */
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    statement_timeout: DB_TIMEOUTS_MS.statement,
    lock_timeout: DB_TIMEOUTS_MS.lock,
    idle_in_transaction_session_timeout: DB_TIMEOUTS_MS.idleInTransaction,
  });
}
