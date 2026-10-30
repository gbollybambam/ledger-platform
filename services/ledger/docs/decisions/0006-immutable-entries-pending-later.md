# DEC-0006: In v1 all entries are immutable. Pending transactions come later.

- Date: 2026-10-27
- Status: accepted

## Decision

In v1, entries and transactions are never updated or deleted. There is no pending state. Mistakes are fixed with a reversal transaction. Pending, posted, and archived states, with replaceable pending entries, are planned for v1.1.

## Rejected options

- Add pending and posted states in v1.
- Allow edits to entries with an edit history.

## Why

One simple rule is easy to enforce and test: nothing changes. Clients that move money in steps can model in-flight money with ordinary accounts, for example a "payouts in transit" account, without pending states.

## Trade-offs and risks

No available balance, and no holds. When pending is added, the rule becomes "posted entries never change. Only pending entries can be replaced." That needs a new decision entry.
