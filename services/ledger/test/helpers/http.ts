interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | undefined>;
  json(): unknown;
}

export function expectErrorBody(
  _response: HttpResponse,
  _expected: { status: number; code: string; message?: string },
): void {
  throw new Error('not implemented');
}

export function expectIdentical401(_responses: HttpResponse[]): void {
  throw new Error('not implemented');
}
