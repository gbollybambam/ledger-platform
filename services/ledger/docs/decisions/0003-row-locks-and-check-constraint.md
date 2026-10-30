# DEC-0003: Prevent overdraft with row locks and a CHECK constraint

- Date: 2026-10-27
- Status: accepted

## Decision

When posting, lock all touched account rows with `SELECT ... FOR UPDATE`, in order of account ID. Then write entries and update totals. A CHECK constraint on the account row rejects any state where a non-negative account goes below zero.

## Rejected options

- Version locking (the client sends an account version and the write fails if it changed). Busy accounts can starve, because the version keeps moving.
- Serializable isolation for everything. It needs retry logic everywhere.
- Checking the balance in app code only. It is not safe under concurrency.

## Why

Locking in a fixed order prevents deadlocks between my own transactions. The CHECK constraint is the last line of defense. The database enforces the rule even if the app has a bug.

## Trade-offs and risks

A very busy account becomes a bottleneck, because writes to it are serialized. This is accepted in v1 and written in the known limits. The scaling path is in `docs/versions.md` (v4.0).
