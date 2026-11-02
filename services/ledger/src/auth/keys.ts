import { createHash, randomBytes } from 'node:crypto';

export function generateApiKey(): string {
  return `lk_${randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, 8);
}
