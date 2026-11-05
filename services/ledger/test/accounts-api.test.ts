import { afterAll, beforeAll, describe, it } from 'vitest';
import type { TestApp } from './helpers/app.js';
import { buildTestApp } from './helpers/app.js';

function notImplemented(): never {
  throw new Error('not implemented');
}

describe('accounts API', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('derives the normal balance for each kind', () => notImplemented());
  it('refuses unknown fields', () => notImplemented());
  it('never echoes client text', () => notImplemented());
  it('refuses an unknown currency', () => notImplemented());
  it('refuses negative balances outside equity', () => notImplemented());
  it('refuses a duplicate external_id', () => notImplemented());
  it('creating is idempotent', () => notImplemented());
  it('scopes are exact', () => notImplemented());
  it('lookup is scoped to the caller by default', () => notImplemented());
  it('limits the body size', () => notImplemented());
  it('records the creating client', () => notImplemented());
  it('returns the exact account shape', () => notImplemented());
  it('reads an account by id', () => notImplemented());
  it('lists the currencies', () => notImplemented());
  it('documents accounts and currencies', () => notImplemented());
});
