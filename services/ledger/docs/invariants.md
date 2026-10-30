# Invariants (ledger)

Rules that hold for **every** feature. Each feature's "done when" list starts with:
"All rules in `docs/invariants.md` still hold."

**Status: LOCKED for v1.** To change a rule, write a new decision entry in `docs/decisions/` first.

How to read this file: a rule is only real if something fails when it is broken. The right column says what.

## A. Money and the ledger

| ID | Rule | What fails if it is broken |
| -- | ---- | -------------------------- |
| INV-01 | Money is a positive integer in minor units. No floats anywhere. The API takes and returns amounts as integer strings (DEC-0008). Code uses `bigint`. | Tests reject decimals, negatives, zero, empty, leading zeros, and non-digits. Lint bans float math and decimal literals in `src/`. |
| INV-02 | Entries and transactions are never updated or deleted. | A database trigger blocks it. The app role has no `UPDATE` or `DELETE` grant (DEC-0016). Tests try both as the app role and fail. |
| INV-03 | Every transaction balances. It has 2 or more entries, at least one debit and one credit, and total debits equal total credits. | A property-based test with random transactions. A database trigger enforces it at commit. |
| INV-04 | All entries in a transaction use one currency. Each entry's currency equals its account's currency. Every currency is on the allow-list (DEC-0015). | A test posts a mixed-currency transaction and an unknown currency. Foreign keys enforce both. |
| INV-05 | A write is all or nothing. A transaction's entries, the account total updates, and its idempotency record commit together. | A test forces a failure mid-write. Nothing is saved. |
| INV-06 | An account that does not allow negative balances never goes below zero, even under concurrency. | A CHECK constraint on `accounts`. A concurrency test with many parallel transfers on a few busy accounts: no negative balance, no deadlock. |
| INV-07 | The same idempotency key from the same client with the same request gives the same response and one transaction. The same key with a different request is rejected (409) and moves no money. | A test sends one request 50 times in parallel. Exactly one transaction exists. |
| INV-08 | A mistake is fixed only by a reversal. A transaction can be reversed at most once. A reversal cannot be reversed in v1. | A unique constraint on `reverses_transaction_id`. A test reverses twice. |
| INV-09 | Cached account totals equal the sums of the entries. Per currency, total debit-normal balances equal total credit-normal balances. | The `verify` command runs at the end of every integration test and in CI. |
| INV-10 | The ledger makes no outbound network call while a database transaction is open. In v1 it makes none at all. | Code review rule and a test that scans the source for network clients. |

## B. Who can do what

| ID | Rule | What fails if it is broken |
| -- | ---- | -------------------------- |
| INV-11 | Every route except `/health` and `/health/ready` needs a valid client key with the right scope. Keys are stored only as hashes. | Tests for missing, wrong, revoked, and under-scoped keys. A test that reads the database for the plaintext key and finds none. |
| INV-12 | Every account and every transaction records the client that created it. | `NOT NULL` foreign keys. Tests check the value. |
| INV-13 | `(client, external_ref)` is unique. A repeat is rejected and creates nothing. | A unique constraint. A test posts the same reference twice. |
| INV-14 | Secrets never appear in logs, error bodies, or responses. This covers API keys and the `Authorization` header. | A test captures the logs of a failed and a successful request, and searches for the key. |

## C. Reading and the contract

| ID | Rule | What fails if it is broken |
| -- | ---- | -------------------------- |
| INV-15 | A list never skips or repeats a committed row. Entries of one account page by `seq`. Global transaction lists return only rows older than the lag and report `as_of` (DEC-0019). | A test writes while it pages, and checks that the union of all pages equals the truth. A test that the app role has `transaction_timeout`. |
| INV-16 | The routes the service serves are exactly the routes in `openapi/ledger.v1.yaml`. Every `POST` uses `Idempotency-Key`. A breaking change needs a new version path (`/v2`). | `test/openapi.test.ts` and `npm run openapi:lint`. |

## Decided in research

- Can a balance go negative? **No**, unless the account is created with `allow_negative: true`. The default is `false`.
- Which balance is the source of truth? **The entries.** Cached totals are derived (DEC-0002).
- Currencies? One per transaction (DEC-0004). Allowed codes come from a table (DEC-0015).
- Reconciliation, payouts, webhooks? **Not the ledger's job.** Other services do them with `external_ref` and the query API.

## Rules for the code (not testable alone, but reviewed)

- Money is `bigint` in code. Never `number`.
- Every SQL statement is parameterized. Never build SQL with string concatenation of user input.
- Never catch and swallow a database error. Map known error codes to API errors. Let everything else become a 500 with a request ID.
- Never retry a failed write inside the ledger without an idempotency guarantee.
