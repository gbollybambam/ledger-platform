import { describe, it } from 'vitest';

function notImplemented(): never {
  throw new Error('not implemented');
}

describe('accounts validation', () => {
  it('refuses wrong types', () => notImplemented());
  it('refuses incomplete bodies', () => notImplemented());
  it('field boundaries', () => notImplemented());
  it('refuses malformed JSON', () => notImplemented());
  it('content types', () => notImplemented());
  it('refuses bad queries', () => notImplemented());
});
