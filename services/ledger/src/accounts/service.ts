import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../http/errors.js';
import { insertAccount } from './sql.js';
import type { Account, AccountKind, CreateAccountBody, NormalBalance } from './schemas.js';

const normalBalances: Record<AccountKind, NormalBalance> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};

export async function createAccount(
  tx: PoolClient,
  clientId: string,
  body: CreateAccountBody,
): Promise<Account> {
  const allowNegative = body.allow_negative ?? false;
  if (allowNegative && body.kind !== 'equity') {
    throw new ApiError(422, 'invalid_account', 'Only equity accounts may allow negative balances');
  }

  try {
    return await insertAccount(tx, {
      id: randomUUID(),
      clientId,
      name: body.name,
      kind: body.kind,
      normalBalance: normalBalances[body.kind],
      currency: body.currency,
      allowNegative,
      externalId: body.external_id ?? null,
    });
  } catch (error) {
    if (isPgError(error, '23505', 'accounts_client_id_external_id_key')) {
      throw new ApiError(
        409,
        'external_id_conflict',
        'An account with this external_id already exists',
      );
    }
    if (isPgError(error, '23503', 'accounts_currency_fkey')) {
      throw new ApiError(422, 'unknown_currency', 'Currency is not supported');
    }
    throw error;
  }
}

function isPgError(error: unknown, code: string, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  if (!('code' in error) || !('constraint' in error)) {
    return false;
  }
  return error.code === code && error.constraint === constraint;
}
