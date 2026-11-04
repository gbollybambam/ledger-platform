import { describe, expect, it } from 'vitest';
import { mapDbError } from '../src/http/db-errors.js';

describe('database error mapping', () => {
  it.each(['55P03', '40P01', '25P04'])('answers 503 busy for database error %s', (code) => {
    expect(mapDbError({ code })).toMatchObject({
      statusCode: 503,
      code: 'busy',
      message: 'The service is busy. Retry with the same Idempotency-Key.',
    });
  });

  it('hides unknown database errors', () => {
    expect(mapDbError({ code: 'XX000', message: 'secret database detail' })).toBeUndefined();
  });
});
