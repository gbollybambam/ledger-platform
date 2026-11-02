import type { Scope } from '../../src/auth/types.js';

export interface TestClient {
  id: string;
  name: string;
  key: string;
  scopes: Scope[];
  authorization: string;
  revoke(): Promise<void>;
  remove(): Promise<void>;
}

export async function createTestClient(_options?: {
  scopes?: Scope[];
  name?: string;
}): Promise<TestClient> {
  throw new Error('not implemented');
}

export async function withTestClient<T>(
  _options: { scopes?: Scope[]; name?: string },
  _fn: (client: TestClient) => Promise<T>,
): Promise<T> {
  throw new Error('not implemented');
}

export async function closeTestDb(): Promise<void> {
  throw new Error('not implemented');
}
