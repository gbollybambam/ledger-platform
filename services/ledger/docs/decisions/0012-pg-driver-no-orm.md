# DEC-0012: Plain SQL with the `pg` driver. No ORM.

- Date: 2026-10-27
- Status: accepted

## Decision

Talk to PostgreSQL with the `pg` driver and hand-written SQL. A query builder may be added later if SQL building gets repetitive. Migrations use `node-pg-migrate` with plain SQL files (see DEC-0017).

## Rejected options

- A full ORM (Prisma, TypeORM). It hides locks, constraints, and triggers, and those are the core of this project.
- A query builder (Kysely) from day one. Not needed yet. Revisit if needed.

## Why

The safety rules live in SQL: `FOR UPDATE`, CHECK constraints, triggers, and unique indexes. I want to see and test them directly.

## Trade-offs and risks

More SQL by hand. No compile-time check of queries. Integration tests against a real database are the safety net.
