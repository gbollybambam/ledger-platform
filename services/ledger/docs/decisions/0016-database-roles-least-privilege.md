# DEC-0016: Two database roles, with least privilege

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Decision

- **`ledger_migrator`** owns the database and all tables. It runs migrations and operator tools. The running service never uses it.
- **`ledger_app`** is what the service connects as. It is not a superuser. It cannot create objects, including temporary tables. It has only the privileges each migration grants, for example `INSERT` and `SELECT` on `entries`, and **no** `UPDATE` or `DELETE`.
- **An admin account** (a superuser) is used only by `npm run db:bootstrap`, to create the two roles. The service never gets its credentials.
- `PUBLIC` has no privileges on the database or the `public` schema.
- The `ledger_app` role has default time limits for statements, lock waits, idle-in-transaction, and whole transactions.
- Grants are written explicitly in each migration. There are no broad default privileges.

## Rejected options

- One role for everything. A bug or an injection in the service could then rewrite history or drop tables.
- Row-level security. It is useful for many tenants, and the ledger has few clients.

## Why

Immutability (INV-02) is then true even if the application code is wrong. The database refuses the change.

## Trade-offs and risks

More setup. `db:bootstrap` makes it one command, and the tests run it. A forgotten grant fails loudly with "permission denied".
