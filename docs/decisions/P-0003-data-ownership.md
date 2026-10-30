# P-0003: Each service owns its data. No shared database.

- Date: 2026-10-27
- Status: accepted

## Decision

Each service has its own PostgreSQL database and its own database roles. No service connects to another service's database or reads its tables. Services talk only through their HTTP APIs.

## Rejected options

- A shared database with separate schemas. It is fast to build, and it breaks isolation. A change to a table could break another service without any test noticing.
- Reconciliation reading the ledger tables directly.

## Why

The API is the contract. The ledger can change its tables freely, as long as the API stays the same.

## Trade-offs and risks

Reads that cross services are slower than a SQL join. The ledger therefore offers a safe, paged query API (ledger DEC-0019). A read replica or an event feed can be added later without breaking this rule.
