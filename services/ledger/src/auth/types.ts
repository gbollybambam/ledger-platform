export const SCOPES = ['ledger:read', 'ledger:write'] as const;

export type Scope = (typeof SCOPES)[number];
export type Access = 'public' | 'any-client' | Scope;

export interface AuthenticatedClient {
  id: string;
  name: string;
  scopes: Scope[];
}
