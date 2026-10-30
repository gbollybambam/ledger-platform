/**
 * Database time limits. One place, used by the connection pool and by the
 * role defaults in scripts/lib/bootstrap.ts (defense in depth).
 *
 * - statement: one SQL statement may run at most this long.
 * - lock: waiting for a row lock fails after this long (clients may retry).
 * - idleInTransaction: a connection left open inside a transaction is killed.
 * - transaction: a whole transaction may last at most this long (PostgreSQL 17 or newer).
 *   This limit makes a promise possible: any transaction older than this is finished,
 *   so a list of rows older than `transaction` plus a margin can never gain new rows
 *   (see docs/decisions/0019-listing-watermark.md). Set only as a role default.
 *
 * Revisit these in the concurrency-proof feature (F5), when lock waits are measured.
 */
export const DB_TIMEOUTS_MS = {
  statement: 10_000,
  lock: 5_000,
  idleInTransaction: 15_000,
  transaction: 20_000,
} as const;
