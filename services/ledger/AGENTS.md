# AGENTS.md (ledger service)

Rules for any LLM working in `services/ledger`. Read the repository root `AGENTS.md` too.
**Run all commands from `services/ledger`.**

## What this service is

A double-entry ledger. The source of truth for balances. It is called over HTTP by other services. It knows nothing about payment providers, webhooks, payouts, or statements. Do not add anything about them.

It is designed for real money. When a rule and convenience disagree, the rule wins.

## Where things live

| Need                              | File                                  |
| --------------------------------- | ------------------------------------- |
| What to build                     | `docs/prd.md`                         |
| How it works                      | `docs/rfc-001.md`                     |
| Rules for every feature           | `docs/invariants.md`                  |
| Order of work and status          | `docs/roadmap.md`                     |
| All versions, now and later       | `docs/versions.md`                    |
| The feature I am on now           | `docs/features/F<nn>-<name>.md`       |
| Feature template                  | `docs/features/_template.md`          |
| Why each choice was made          | `docs/decisions/`                     |
| What I learned in research        | `docs/research/notes.md`              |
| The API contract                  | `openapi/ledger.v1.yaml`              |
| Minor findings                    | `BACKLOG.md`                          |
| The work loop and prompts         | `../../docs/process/` (repository root `docs/process/`) |
| Git rules                         | `../../CONTRIBUTING.md`               |

## Stack

- TypeScript on Node.js (Node 24 LTS in CI, 22.9 or newer works). ES modules. Imports end in `.js`.
- Fastify 5 for HTTP. `pg` for PostgreSQL. No ORM. Plain SQL.
- PostgreSQL 17 or newer.
- Vitest, against a real PostgreSQL. Property-based tests with fast-check (add it when the first property test is written, and say why).
- ESLint (typed, with money rules) and Prettier.
- `node-pg-migrate` for migrations: plain SQL, forward-only.

## Commands

| Command | What it does |
| ------- | ------------ |
| `npm run db:up` | Start the dev and test databases (Docker) |
| `npm run db:setup` | Create the database roles, then run migrations (dev database) |
| `npm test` | Prepare the test database, then run all tests |
| `npm run lint` / `typecheck` / `format:check` | Must all pass before a PR |
| `npm run openapi:lint` | Check the OpenAPI file |
| `npm run migrate` | Apply pending migrations (dev database) |
| `npm run migrate:create -- <name>` | Create a new SQL migration file |
| `npm run build` | Compile to `dist/` |
| `npm run dev` | Run the service with reload |

Before you say a task is done, run: `npm run lint && npm run format:check && npm run typecheck && npm run openapi:lint && npm test && npm run build`.

## Money rules (non-negotiable)

1. Money is a `bigint` in code, a `bigint` column in the database, and an **integer string** in the API. Never a JavaScript `number`.
2. No floating-point math. The lint rules ban `parseFloat`, `toFixed`, `Math.round/floor/ceil/trunc`, and decimal literals in `src/`. Do not disable these rules to get around a problem.
3. Every SQL statement is parameterized. Never build SQL by joining user input into a string.
4. Every write follows the posting steps in `docs/rfc-001.md`. Do not invent a shortcut.
5. Lock accounts in sorted ID order. Always.
6. Do not make network calls while a database transaction is open.
7. Never catch and swallow a database error. Map the known codes in the RFC. Let everything else become a 500.
8. Never log secrets, API keys, or the `Authorization` header.
9. The running service connects as `ledger_app`. It must never need more privilege. If a feature needs a new privilege, add an explicit `GRANT` in a migration and say so in the PR.

## Database rules

- Migrations are plain SQL in `migrations/`, forward-only. No `Down` section. Never edit a merged migration.
- Create a migration with `npm run migrate:create -- <name>`. One idea per migration.
- Rules that protect money belong in the database too (constraints, triggers, grants), not only in code.
- Tests use the real database. Do not mock it.

## API rules

- Change `openapi/ledger.v1.yaml` in the same commit as the code. The drift test fails if they differ.
- Paths start with `/v1`. Changes inside `/v1` are additive.
- Every `POST` requires an `Idempotency-Key` parameter in the spec.
- Every error uses `{ "error": { "code", "message", "request_id" } }`.

## Testing rules

- Tests first. Show them failing for the right reason before you implement.
- Never weaken, skip, or delete a test to make it pass.
- Each "done when" rule needs at least one test that fails when the rule is broken.
- Tests that write data end with the `verify` check once it exists (F7).
- Test file names end in `.test.ts` and live in `test/`.

## Never

- Never edit `docs/invariants.md`, any decision record, `docs/roadmap.md`, or any `AGENTS.md` without asking the owner.
- Never add a dependency without asking. Say why and what else you considered.
- Never build anything listed under "Not in v1" in `docs/versions.md`.
- Never disable a lint rule, a CI check, or a database constraint.
- Never use `any`, `@ts-ignore`, or `as` casts to silence a type error. Fix the type.
