# DEC-0020: Account rules

- Date: 2026-11-04
- Status: accepted

## Decision

1. The **normal balance follows the kind**: asset and expense are debit-normal, liability, equity, and revenue are credit-normal. Clients do not send it. A database CHECK enforces it.
2. `allow_negative` is `false` by default and may be `true` **only for `equity`** accounts (a database CHECK).
3. An account's **identity never changes** (name, kind, normal balance, currency, `allow_negative`, `external_id`, client, `created_at`). There is no rename or `PATCH`. A trigger enforces it. Only totals and version change, and only through posting (F4).
4. Accounts are **never deleted**. A trigger refuses `DELETE`.
5. The app role cannot set totals, version, or `created_at` when it creates an account (column-level `INSERT` grant). An account always starts at zero.
6. `external_id` is optional and unique per client. A duplicate gives 409 `external_id_conflict`. Clients find an account with `GET /v1/accounts?external_id=`.
7. The account representation holds identity only, never balances.

## Rejected options

- Client-supplied normal balance. A wrong pair would give wrong balances.
- Contra accounts (for example accumulated depreciation). Planned for v3.0.
- Negative balances for liabilities or assets. Customer money must never overdraw.
- "Get or create" by `external_id`. A create that silently returns another account hides bugs.
- Rename and delete. History must stay explainable.

## Why

Each rule removes a way for a bug to create money or hide it. The database enforces them, so code cannot break them.

## Trade-offs and risks

A wrong name or kind means creating a new account. An account that equity-style overdraws needs the `equity` kind. Contra accounts are not possible until v3.0.
