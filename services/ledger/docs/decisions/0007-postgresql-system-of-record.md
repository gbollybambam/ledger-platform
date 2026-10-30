# DEC-0007: PostgreSQL is the system of record. No Redis in v1.

- Date: 2026-10-27
- Status: accepted

## Decision

All ledger, gateway, and reconciliation data lives in PostgreSQL. Tests run against a real Postgres in Docker. There is no cache layer or queue in v1.

## Rejected options

- A specialized ledger database such as TigerBeetle as the main store. It is a different tool and still needs another database for metadata. It is a v4.0 experiment.
- Redis for cache and keys.

## Why

Postgres gives transactions, row locks, CHECK constraints, triggers, and constraints on one machine. PostgreSQL 17 or newer is required, for the `transaction_timeout` setting (see DEC-0019). This covers every v1 rule. Fewer parts means fewer bugs.

## Trade-offs and risks

Throughput is limited to what one Postgres node and row locks allow. The benchmark report will state this.
