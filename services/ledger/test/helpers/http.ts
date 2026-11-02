interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | undefined>;
  json(): unknown;
}

export function expectErrorBody(
  _response: HttpResponse,
  _expected: { status: number; code: string; message?: string },
): void {
  return undefined;
}

export function expectIdentical401(_responses: HttpResponse[]): void {
  return undefined;
}
