# Ledger service

A double-entry ledger service. It is the source of truth for balances. It is called over HTTP by other services.

**Status:** Phase 2 (skeleton) is built. Features start with F1 (`docs/roadmap.md`).

**Designed for real money. A passing build is not a launch approval.** See `../../docs/production-readiness.md`.

## What it guarantees (the goal for v1.0.0)

- Entries and transactions are never changed or deleted. The database refuses it, even if the code is wrong.
- Every transaction balances. Money cannot be created or lost.
- A balance that must not go negative never does, even with many requests at once.
- A retried request never moves money twice.
- Every caller is known, scoped, and recorded.
- Lists never skip a committed row.

These are rules in `docs/invariants.md`, each with a test. They are not all built yet: they arrive feature by feature.

## Quick start

You need Node.js 22.9 or newer (24 recommended, see `.nvmrc`) and Docker.

```
npm ci
cp .env.example .env        # on Windows: copy .env.example .env
npm run db:up               # starts PostgreSQL 17: dev on 5432, test on 5433
npm run db:setup            # creates the database roles, applies migrations
npm test                    # runs all tests against the real test database
npm run dev                 # starts the service on http://localhost:3000
```

Check it:

```
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

## How the database is set up

Three database roles (see `docs/decisions/0016-database-roles-least-privilege.md`):

| Role | Used for | Variable |
| ---- | -------- | -------- |
| `ledger_admin` | Creating the two roles below. Never given to the service | `ADMIN_DATABASE_URL` |
| `ledger_migrator` | Owning tables and running migrations | `MIGRATION_DATABASE_URL` |
| `ledger_app` | The running service. Limited | `DATABASE_URL` |

## Project docs

- What to build: `docs/prd.md`
- How it works: `docs/rfc-001.md`
- Rules for every feature: `docs/invariants.md`
- Order of work: `docs/roadmap.md`
- All planned versions: `docs/versions.md`
- Decisions: `docs/decisions/`
- Research notes: `docs/research/notes.md`
- The API contract: `openapi/ledger.v1.yaml`
- Rules for LLM tools: `AGENTS.md`
