# DEC-0019: Safe listing: sequence paging per account, and a watermark for global lists

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Problem

Database sequences are not in commit order. Transaction A can take number 10 and commit **after** transaction B takes 11 and commits. A reader who has seen 11 would never see 10. A reconciliation job built on such a list would miss real transactions without any error.

## Decision

1. **Entries of one account** are listed by `seq`, with a cursor. This is safe: writes to one account hold that account's row lock until commit, so for one account `seq` order is commit order.
2. **Global transaction lists** (for example "all transactions in a time window") only return transactions with `created_at <= now() - lag`. The default lag is 30 seconds. The response includes `as_of`, the watermark that was used.
3. The lag is safe because the app role has `transaction_timeout = 20s` (PostgreSQL 17). No ledger transaction can last longer than 20 seconds, so any transaction older than the lag has already finished.
4. `created_at` is set by the database clock (`now()`, the transaction start time). Clients never supply it.

## Rejected options

- Paging a global list by `seq` or by `created_at` alone. It can skip rows.
- Using `txid_snapshot` or `pg_current_snapshot()` tricks. They are correct but hard to explain and test.
- A transactional outbox in v1. It is the stronger answer and is planned for v1.1.

## Why

It gives other services a list that never skips a committed transaction, with a rule that can be tested and explained.

## Trade-offs and risks

Global lists are about 30 seconds behind. Consumers must say "as of" and reconcile windows that end before the watermark. A deploy that raises `transaction_timeout` must also raise the lag.
