# Research notes

Draft written from the sources I read. **Rewrite each "in my words" line yourself.** Writing it again is how it sticks.

Sources:
- **MT-AfD:** Modern Treasury, "Accounting for Developers".
- **MT-Scale:** Modern Treasury, "How to Scale a Ledger" (six parts).
- **TB:** TigerBeetle docs (data modeling, transfers, design).

Version tags point to `docs/versions.md`. "Other service" means the gateway or reconciliation service.

## Accounting basics

- **Accounts, transactions, entries.** A transaction has 2 or more entries. Each entry hits one account. (MT-AfD) -> v1
- **Debit-normal and credit-normal accounts.** Assets and expenses are debit-normal. Liabilities, equity, and revenue are credit-normal. A debit raises a debit-normal account and lowers a credit-normal one. (MT-AfD) -> v1
- **The ledger is balanced when total debits equal total credits.** If not, money was created or lost. (MT-AfD) -> v1
- **Never mutate a balance directly.** Store immutable entries. Compute balances from them. (MT-AfD) -> v1
- **Wallet chart of accounts.** User wallet (liability), cash (asset), fee revenue, card fee expense. A user's wallet is money we owe them. (MT-AfD) -> v1
- **Lending uses an amortization schedule outside the ledger.** The ledger holds the history. (MT-AfD) -> v5+

## The four ledger guarantees (MT-Scale)

1. **Immutability.** Every past state can be rebuilt. -> v1 (v2.0 for as-of queries)
2. **Double-entry enforcement.** Source and destination are always recorded. -> v1
3. **Concurrency control.** No double spending, even in parallel. -> v1
4. **Efficient aggregation.** Balances are fast to read. -> v1 (v2.0 for history)

## Writing safely

- **Clients create transactions, not single entries.** This avoids half-written money moves. (MT-Scale) -> v1
- **Balance locking beats version locking for busy accounts.** Version locks can starve. (MT-Scale) -> v1 (DEC-0003)
- **Idempotency keys stop double spends on retry.** Keep them about 24 hours. Same key returns the old response. (MT-Scale) -> v1 (DEC-0005)
- **Group entries by currency when checking balance.** Equal totals across currencies is not a balanced transaction. (MT-Scale) -> v1 per transaction (DEC-0004), v2.1 for conversion
- **Currency conversion needs four accounts, not two entries.** Rates move and no single rate is agreed. (MT-Scale) -> v2.1
- **Corrections are new transfers.** Transfers can't be changed or deleted. (TB) -> v1 (reversals)
- **Each TB transfer has one debit and one credit.** Bigger moves use linked transfers that succeed or fail together. (TB) -> v1 supports N entries natively

## Pending money and time

- **Three balances: posted, pending, available.** Real money settles later than the ledger records it. (MT-Scale) -> v1.1
- **Only pending entries can be replaced.** Posted entries are permanent. (MT-Scale) -> v1.1
- **Two-phase transfers: reserve first, post later.** (TB) -> v1.1
- **`effective_at` lets a client backdate a transaction.** (MT-Scale) -> v2.0
- **Account versions on entries** let a client get a balance and its matching entries consistently. (MT-Scale) -> v2.0
- **Transaction versions** keep the history of a pending transaction. (MT-Scale) -> v2.0
- **Audit log** records who changed what, and when. (MT-Scale) -> v1.1

## Speed

- **Cache current balances** in the account row. Update them atomically with entries. (MT-Scale) -> v1
- **Check for cache drift.** Compare cache to entries. Turn off a drifted cache. (MT-Scale) -> v1 (verify), v1.1 (scheduled)
- **Historical balances:** anchoring (end-of-day snapshots) and resulting-balance caches. (MT-Scale) -> v2.0
- **Recording mode vs authorizing mode.** Recording is high throughput and eventually consistent. Authorizing is strict and slower. (MT-Scale) -> v4.0
- **Hot accounts** are accounts with many writes. Locks make them a bottleneck. (MT-Scale) -> v4.0
- **Write-ahead queues, batching, sharding.** (MT-Scale, TB) -> v4.0
- **Single-writer design and batching** are TigerBeetle's way to get speed. (TB) -> v4.0 experiment

## Gateway and reconciliation (for those services, later)

These ideas belong to other services. They are kept here so nothing is lost.

- **Reconciliation compares the ledger to bank or provider records and finds drift.** (MT-Scale) -> other service
- **Provider events arrive late, twice, or out of order.** Dedupe by event ID. -> other service
- **Verify webhook signatures.** -> other service
- **The ledger should be separate from fund movement.** (MT-AfD) -> v1 (the ledger is its own service)
- **Search needs index tuning, partitioning, and cursor pagination.** (MT-Scale) -> v1 (cursor), v3.0

## Numbers worth remembering

- Idempotency keys: keep at least 24 hours. (MT-Scale)
- Leading fintechs pass 5,000 queries per second on a ledger. (MT-Scale)
