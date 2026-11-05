import { afterAll, beforeAll, describe, it } from 'vitest';
import type pg from 'pg';
import { createTestPool } from './helpers/db.js';

function notImplemented(): never {
  throw new Error('not implemented');
}

describe('accounts concurrency', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('accounts concurrency', () => notImplemented());
});
