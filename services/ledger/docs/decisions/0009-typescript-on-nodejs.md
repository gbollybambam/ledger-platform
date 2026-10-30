# DEC-0009: TypeScript on Node.js

- Date: 2026-10-27
- Status: accepted

## Decision

TypeScript on Node.js, with plain SQL against PostgreSQL. CI uses Node 24 LTS (`.nvmrc`).

## Rejected options

- Python with Django.
- PHP with Laravel.
- A heavy ORM that hides SQL. Locks and constraints need to be visible (see DEC-0012).

## Why

I already use TypeScript and Node.js. Types help with money code. Property-based testing is available (fast-check). Postgres tooling is mature.

## Trade-offs and risks

JSON numbers lose precision for big integers. The integer-string rule (DEC-0008) covers this. If I change stack, update this entry and `AGENTS.md`. The design in `docs/rfc-001.md` does not depend on the language.
