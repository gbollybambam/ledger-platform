import { expect } from 'vitest';

interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | undefined>;
  json(): unknown;
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string' &&
    'request_id' in error &&
    typeof error.request_id === 'string'
  );
}

export function expectErrorBody(
  response: HttpResponse,
  expected: { status: number; code: string; message?: string },
): void {
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.statusCode).toBe(expected.status);
  const body = response.json();
  if (!isErrorBody(body)) {
    throw new Error('expected an error body');
  }
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).sort()).toEqual(['code', 'message', 'request_id']);
  expect(body.error.code).toBe(expected.code);
  expect(body.error.request_id).toBe(response.headers['x-request-id']);
  if (expected.message !== undefined) {
    expect(body.error.message).toBe(expected.message);
  }
}

export function expectIdentical401(responses: HttpResponse[]): void {
  expect(responses.length).toBeGreaterThan(0);
  const first = responses[0]!;
  const firstBody = first.json();
  if (!isErrorBody(firstBody)) {
    throw new Error('expected an error body');
  }
  const firstError = firstBody.error;
  expect(Object.keys(firstError).sort()).toEqual(['code', 'message', 'request_id']);
  const requestIds = new Set<string>();

  for (const response of responses) {
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toBe(first.headers['content-type']);
    expect(response.headers['www-authenticate']).toBe(first.headers['www-authenticate']);
    const body = response.json();
    if (!isErrorBody(body)) {
      throw new Error('expected an error body');
    }
    const error = body.error;
    expect(Object.keys(error).sort()).toEqual(['code', 'message', 'request_id']);
    expect(error.code).toBe(firstError.code);
    expect(error.message).toBe(firstError.message);
    expect(error.request_id).toBe(response.headers['x-request-id']);
    requestIds.add(error.request_id);
  }

  expect(requestIds.size).toBe(responses.length);
}
