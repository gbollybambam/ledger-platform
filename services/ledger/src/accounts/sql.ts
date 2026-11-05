import type { Pool, PoolClient } from 'pg';
import type { Account, AccountKind, NormalBalance } from './schemas.js';

interface AccountRow {
  id: string;
  client_id: string;
  name: string;
  kind: AccountKind;
  normal_balance: NormalBalance;
  currency: string;
  allow_negative: boolean;
  external_id: string | null;
  created_at: Date;
}

export function accountFromRow(row: AccountRow): Account {
  return {
    id: row.id,
    client_id: row.client_id,
    name: row.name,
    kind: row.kind,
    normal_balance: row.normal_balance,
    currency: row.currency,
    allow_negative: row.allow_negative,
    external_id: row.external_id,
    created_at: row.created_at.toISOString(),
  };
}

const accountColumns = `id, client_id, name, kind, normal_balance, currency,
  allow_negative, external_id, created_at`;
const accountColumnsQualified = `a.id, a.client_id, a.name, a.kind, a.normal_balance, a.currency,
  a.allow_negative, a.external_id, a.created_at`;

export async function insertAccount(
  tx: PoolClient,
  values: {
    id: string;
    clientId: string;
    name: string;
    kind: AccountKind;
    normalBalance: NormalBalance;
    currency: string;
    allowNegative: boolean;
    externalId: string | null;
  },
): Promise<Account> {
  const result = await tx.query<AccountRow>(
    `INSERT INTO accounts
       (id, client_id, name, kind, normal_balance, currency, allow_negative, external_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${accountColumns}`,
    [
      values.id,
      values.clientId,
      values.name,
      values.kind,
      values.normalBalance,
      values.currency,
      values.allowNegative,
      values.externalId,
    ],
  );
  return accountFromRow(result.rows[0]!);
}

export async function getAccount(pool: Pool, id: string): Promise<Account | undefined> {
  const result = await pool.query<AccountRow>(
    `SELECT ${accountColumns} FROM accounts WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : accountFromRow(row);
}

export async function findAccount(
  pool: Pool,
  externalId: string,
  clientName: string,
): Promise<Account | undefined> {
  const result = await pool.query<AccountRow>(
    `SELECT ${accountColumnsQualified}
       FROM accounts AS a
       JOIN clients AS c ON c.id = a.client_id
      WHERE a.external_id = $1 AND c.name = $2`,
    [externalId, clientName],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : accountFromRow(row);
}
