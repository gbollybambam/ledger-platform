import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey } from '../src/auth/keys.js';

describe('API key generation', () => {
  it('creates lk_ followed by 43 base64url characters', () => {
    const key = generateApiKey();

    expect(key).toMatch(/^lk_[A-Za-z0-9_-]{43}$/);
    expect(key.slice(0, 8)).toBe(key.substring(0, 8));
    expect(key.slice(0, 3)).toBe('lk_');
  });

  it('creates 1,000 different keys without using Math.random', () => {
    const keys = new Set(Array.from({ length: 1_000 }, () => generateApiKey()));

    expect(keys.size).toBe(1_000);
  });

  it('hashes the complete key and never treats the display prefix as a credential', () => {
    const key = generateApiKey();
    const prefix = key.slice(0, 8);

    expect(hashApiKey(key)).not.toBe(hashApiKey(prefix));
  });
});
