# DEC-0017: Migrations with `node-pg-migrate`. Plain SQL. Forward-only.

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Decision

- Tool: `node-pg-migrate`. It is a production dependency, so the same image can run migrations.
- Each migration is a plain SQL file in `migrations/`, named `<timestamp>_<what-it-does>.sql`.
- **Forward-only.** No `Down` section is allowed (a test checks this). A mistake is fixed by a new migration.
- All pending migrations run in **one transaction** under an advisory lock. If one fails, none is applied.
- Out-of-order files are refused.
- A merged migration is never edited.
- Migrations run as `ledger_migrator`, never as the app role.
- Large or locking changes follow an expand-and-contract plan across several releases.

## Rejected options

- A hand-written runner. A custom runner is more code to get wrong with real money.
- Down migrations. In a ledger, "undo" must be a new, visible change, not a silent reversal.
- An ORM's migrations. They hide the SQL, and the constraints and triggers are the point here.

## Why

Plain SQL is reviewable and explicit. One transaction and an advisory lock avoid half-applied changes and two runners at once.

## Trade-offs and risks

A bad migration cannot be rolled back with a command. Rehearse migrations on a copy of real data before production (see `docs/production-readiness.md`).
