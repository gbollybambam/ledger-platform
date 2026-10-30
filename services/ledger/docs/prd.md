# PRD: Ledger service

**Status: LOCKED for v1.**

## Summary

A double-entry ledger service. It is the source of truth for balances. Other services call it over HTTP. It is built to production-grade correctness rules, proven by tests, enforced by the database, and honest about its limits.

It does **not** know about payment providers, webhooks, payouts, or statements. Those belong to other services (see `docs/architecture-assessment.md` at the repository root).

**`v1.0.0` means "built and tested". It does not mean "safe for real money".** See `docs/production-readiness.md` at the repository root.

## Problem

Systems that move money fail in the same ways:

- Balances are edited in place, so errors are hard to find.
- A retry moves money twice.
- Two requests at once spend the same money.
- A bug or an injection rewrites history.
- Other systems cannot tell which ledger entry matches which real-world event.

## Goals

1. **Correctness, proven.** Every rule in `docs/invariants.md` has an automated test and, where possible, a database constraint.
2. **Safe under retries and concurrency.**
3. **History cannot be rewritten**, even by a bug in the service.
4. **Easy for other services to use correctly:** a clear contract, idempotency, references, and a safe read API.
5. **Reasons on paper.** Every big choice has a decision record.
6. **Honest limits.** The README states what v1 does not do.

## Non-goals for v1

See "Not in v1" in `docs/versions.md`. The main ones: pending and available balances, fees, currency conversion, backdating, as-of balances, queues, an event feed, a UI, user login, multi-tenant isolation between clients.

## Users

- **Client services** (a gateway, a reconciliation service, a product backend). They create accounts, post transactions, and read balances and history.
- **Operators.** They create and revoke clients, run `verify`, run migrations, and respond to incidents.
- **A reviewer** reading the repository.

## Must-haves

**`v1.0.0` is reached when every must-have is done.**

- [ ] **M1** Clients and API keys with scopes. Keys are hashed. Operator tool to create and revoke clients. (F1)
- [ ] **M2** A currency allow-list. (F2)
- [ ] **M3** Create and read accounts: kind, normal balance, currency, a no-negative flag, an optional external ID. (F2)
- [ ] **M4** Post a balanced transaction with 2 or more entries in one currency, with an optional `external_ref` and metadata. (F3)
- [ ] **M5** Entries and transactions are immutable, enforced by the database and by least-privilege roles. (F3)
- [ ] **M6** Read a balance from cached totals. (F3)
- [ ] **M7** Idempotent writes with `Idempotency-Key` on every POST. (F4)
- [ ] **M8** No overdraft under concurrency, no deadlocks, clear errors on lock timeouts. (F5)
- [ ] **M9** Reverse a transaction once. (F6)
- [ ] **M10** A `verify` command. (F7)
- [ ] **M11** A query API: entries of an account with a cursor, a transaction by ID or by `external_ref`, and a global list with a watermark. (F8)
- [ ] **M12** A complete OpenAPI contract, checked in CI, with response validation. (F9)
- [ ] **M13** Operational basics: structured logs without secrets, graceful shutdown, a Docker image, migrations in CI, a written and tested backup and restore drill. (F9)
- [ ] **M14** A test suite that proves every invariant: property-based, concurrency, idempotency, auth, immutability. (F1 to F9)
- [ ] **M15** README, runbook, known limits, and a production-readiness report. (F10)

## Should-haves

Not needed for `v1.0.0`.

- [ ] **S1** A benchmark report, with honest caveats.
- [ ] **S2** Mutation testing on the posting code.

## Acceptance examples

| Story | Given | When | Then |
| ----- | ----- | ---- | ---- |
| Transfer | A has 1000, B has 0 | Transfer 400 from A to B | A is 600, B is 400. `verify` passes. |
| Overdraft | A has 100, no negative allowed | Transfer 150 from A | 422 `insufficient_funds`. Nothing changes. |
| Retry | A request was sent with key K | The same request is sent again with K | Same response. One transaction. |
| Key reuse | Key K was used for 100 | Key K is used for 200 | 409. No money moves. |
| Reference reuse | A transaction has `external_ref` R | Another transaction uses R from the same client | 409 `external_ref_conflict`. |
| Reversal | Transaction T moved 400 | T is reversed twice | The first works. The second is 409 `already_reversed`. |
| Auth | A client has only `ledger:read` | It posts a transaction | 403. |
| Immutability | A bug tries to update an entry | The service runs `UPDATE entries` | The database refuses it. |
| Safe paging | New rows arrive while a client pages | The client reads all pages | It sees every committed row once. |

## Success criteria

- Every invariant has at least one automated test.
- Concurrency test: at least 1,000 parallel transfers across a few busy accounts. No overdraft. `verify` passes. Repeated 100 times in a row without a failure.
- Idempotency test: the same request in 50 parallel calls makes exactly one transaction.
- CI is green on `main`, including the Docker image build and the dependency audit.
- A restore drill from a backup is written and has been run once.
- A stranger can start the service and post a transaction from the README in about 10 minutes.

## Constraints and assumptions

- One developer. An LLM writes the code from these specs (see P-0007). The planner (Claude) reviews.
- PostgreSQL 17 or newer.
- Everything runs locally with Docker for development.

## Risks

- **AI-written code nobody reads line by line.** Controls: tests first, database-enforced rules, least privilege, lint rules, two review passes, independent review before real money.
- **Scope.** The roadmap names an order and a cut line.
- **Concurrency bugs.** Locks are taken in a fixed order. A stress test is its own feature (F5).
- **Misreading `v1.0.0` as launch approval.** The production-readiness gate exists to prevent that.

## Open questions

None for v1. Questions for later are in `docs/versions.md`.
