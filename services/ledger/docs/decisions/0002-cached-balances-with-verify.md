# DEC-0002: Keep cached totals on accounts. Entries are the source of truth.

- Date: 2026-10-27
- Status: accepted

## Decision

Each account stores `debits_total` and `credits_total`. They update in the same database transaction that writes the entries. The entries are the source of truth. A `verify` command recomputes the totals from entries and compares them.

## Rejected options

- Compute every balance from all entries on each read. It gets slow as entries grow.
- Store one mutable balance and no check. Errors would be hard to find.

## Why

Reads are fast (one row). The no-overdraft rule can use a database CHECK on these totals. The verify command catches drift.

## Trade-offs and risks

Two places hold the same fact. If they differ, the entries win. A bug could cause drift, so verify must run in tests and in CI.
