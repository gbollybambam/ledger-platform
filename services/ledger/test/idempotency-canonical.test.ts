import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/idempotency/canonical-json.js';
import { requestHash } from '../src/idempotency/request-hash.js';

describe('canonical JSON and request hashes', () => {
  it.each([
    ['canonical JSON sorts top-level keys', { b: 1, a: 2 }, '{"a":2,"b":1}'],
    ['canonical JSON sorts nested keys', { a: { d: 1, c: 2 } }, '{"a":{"c":2,"d":1}}'],
    ['canonical JSON keeps array order', [2, 1], '[2,1]'],
    ['canonical JSON uses UTF-16 key order', { B: 1, a: 2 }, '{"B":1,"a":2}'],
    ['canonical JSON handles null', null, 'null'],
  ])('%s', (_name, value, expected) => {
    expect(canonicalJson(value)).toBe(expected);
  });

  it.each([
    ['string and number differ', '1', 1],
    ['null property and missing property differ', { a: null }, {}],
    ['array order matters', [1, 2], [2, 1]],
  ])('%s', (_name, left, right) => {
    expect(canonicalJson(left)).not.toBe(canonicalJson(right));
  });

  it('sorts objects inside arrays', () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe(canonicalJson([{ a: 2, b: 1 }]));
  });

  it.each([
    ['undefined', undefined],
    ['a function', () => undefined],
    ['a bigint', BigInt(1)],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a Date', new Date(0)],
    ['a Map', new Map()],
  ])('rejects %s as non-JSON', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  it('uses the request hash vector for sorted object keys', () => {
    expect(
      requestHash({
        method: 'POST',
        url: '/v1/test-only/idempotent',
        body: { b: 1, a: 2 },
      }),
    ).toBe('7e7c6a3dd98c1c382554874f44617205a5e9b09cfb4a738109b099941358f689');
  });

  it('uses the request hash vector for a null body', () => {
    expect(
      requestHash({
        method: 'POST',
        url: '/v1/test-only/idempotent',
        body: null,
      }),
    ).toBe('20f8eb578d0c0433f780e9ce32b4f83aa31c528b3e463aef7bda930165736d61');
  });

  it('treats no body and null body as the same hash', () => {
    expect(
      requestHash({
        method: 'POST',
        url: '/v1/test-only/idempotent',
        body: null,
      }),
    ).toBe(
      requestHash({
        method: 'POST',
        url: '/v1/test-only/idempotent',
        body: null,
      }),
    );
  });

  it.each([
    ['method', { method: 'GET', url: '/v1/test-only/idempotent', body: null }],
    ['URL', { method: 'POST', url: '/v1/other', body: null }],
    ['query order', { method: 'POST', url: '/v1/test-only/idempotent?b=2&a=1', body: null }],
  ])('changes the request hash when %s changes', (_name, changed) => {
    const base = requestHash({
      method: 'POST',
      url: '/v1/test-only/idempotent?a=1&b=2',
      body: null,
    });
    expect(requestHash(changed)).not.toBe(base);
  });
});
