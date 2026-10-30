# Ledger decisions

One file per decision. Never edit an accepted decision to change its meaning. Write a new one that replaces it, and mark the old one `replaced by DEC-XXXX`.

Platform-wide decisions are in `docs/decisions/` at the repository root (`P-NNNN`).

| ID | Title | Origin |
| -- | ----- | ------ |
| [0001](0001-debit-credit-normality.md) | Debit/credit normality, not signed amounts | design |
| [0002](0002-cached-balances-with-verify.md) | Cached totals on accounts. Entries are the source of truth | design |
| [0003](0003-row-locks-and-check-constraint.md) | Row locks and a CHECK constraint prevent overdraft | design |
| [0004](0004-one-currency-per-transaction.md) | One currency per transaction in v1 | design |
| [0005](0005-idempotency-in-postgres.md) | Idempotency keys in Postgres, same transaction as the write | design |
| [0006](0006-immutable-entries-pending-later.md) | All entries immutable in v1. Pending later | design |
| [0007](0007-postgresql-system-of-record.md) | PostgreSQL 17+ is the only data store. No Redis in v1 | design |
| [0008](0008-amounts-as-integer-strings.md) | Amounts are integer strings in minor units | design |
| [0009](0009-typescript-on-nodejs.md) | TypeScript on Node.js | stack |
| [0010](0010-fastify.md) | Fastify | stack |
| [0011](0011-vitest.md) | Vitest | stack |
| [0012](0012-pg-driver-no-orm.md) | Plain SQL with the `pg` driver | stack |
| [0013](0013-clients-and-api-key-auth.md) | Clients and API-key authentication in v1 | pivot |
| [0014](0014-external-ref-per-client.md) | `external_ref` unique per client | pivot |
| [0015](0015-currency-allow-list.md) | Currency allow-list table | pivot |
| [0016](0016-database-roles-least-privilege.md) | Two database roles, least privilege | pivot |
| [0017](0017-migrations-node-pg-migrate.md) | Migrations: `node-pg-migrate`, plain SQL, forward-only | pivot |
| [0018](0018-openapi-contract-first.md) | OpenAPI 3.0 contract first, with a drift test | pivot |
| [0019](0019-listing-watermark.md) | Safe listing: per-account paging and a watermark | pivot |

"pivot" means the decision came from moving to separate services (see `docs/architecture-assessment.md` at the repository root).
An earlier decision about a simulated payment provider was dropped: provider work belongs to the gateway service.
