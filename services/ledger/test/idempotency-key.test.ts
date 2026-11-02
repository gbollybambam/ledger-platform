import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/http/errors.js';
import { parseIdempotencyKey } from '../src/idempotency/key.js';

describe('Idempotency-Key parsing', () => {
  it.each([
    ['missing', undefined, 'Idempotency-Key header is required'],
    ['empty', '', 'Idempotency-Key header is required'],
    ['7 chars', '1234567', 'Idempotency-Key header is not valid'],
    ['129 chars', 'a'.repeat(129), 'Idempotency-Key header is not valid'],
    ['bad character', 'valid key', 'Idempotency-Key header is not valid'],
    ['two headers', ['abcdefgh', 'ijklmnop'], 'Idempotency-Key header is not valid'],
  ])('rejects a missing or invalid Idempotency-Key: %s', (_name, header, message) => {
    expect(() => parseIdempotencyKey(header)).toThrow(ApiError);
    try {
      parseIdempotencyKey(header);
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        code: 'invalid_request',
        message,
      });
    }
  });

  it.each(['abcdefgh', 'a'.repeat(128), 'ab.cd_ef:gh-ij'])(
    'accepts an Idempotency-Key at an allowed boundary: %s',
    (header) => {
      expect(parseIdempotencyKey(header)).toBe(header);
    },
  );
});
