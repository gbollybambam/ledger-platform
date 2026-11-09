export const accountKinds = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export type AccountKind = (typeof accountKinds)[number];
export type NormalBalance = 'debit' | 'credit';

export interface CreateAccountBody {
  name: string;
  kind: AccountKind;
  currency: string;
  allow_negative?: boolean;
  external_id?: string;
}

export interface Account {
  id: string;
  client_id: string;
  name: string;
  kind: AccountKind;
  normal_balance: NormalBalance;
  currency: string;
  allow_negative: boolean;
  external_id: string | null;
  created_at: string;
}

export const createAccountSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'kind', 'currency'],
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 120,
        pattern: '^[^\\p{Cc}\\s](?:[^\\p{Cc}]*[^\\p{Cc}\\s])?$',
      },
      kind: { type: 'string', enum: accountKinds },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      allow_negative: { type: 'boolean' },
      external_id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
    },
  },
};

export const accountIdSchema = {
  params: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: { id: { type: 'string', format: 'uuid' } },
  },
};

export const findAccountsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['external_id'],
    properties: {
      external_id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
      client: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,39}$' },
    },
  },
};
