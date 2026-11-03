import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical-json.js';

export function requestHash(input: { method: string; url: string; body: unknown }): string {
  const text = `${input.method.toUpperCase()}\n${input.url}\n${canonicalJson(input.body)}`;
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
