# Feature: Skeleton (Phase 2)
Status: in progress

Goal:
A working empty service that proves the whole toolchain: TypeScript, lint with money rules, tests against a real PostgreSQL 17, least-privilege database roles, migrations, an OpenAPI contract with a drift test, a Docker image, and CI.

Out of scope:
- Any ledger tables or endpoints (they start in F1).
- Authentication (F1).
- Anything about the gateway or reconciliation.

Done when:
- [ ] `npm run lint`, `format:check`, `typecheck`, `openapi:lint`, `test`, and `build` pass on my machine
- [ ] `npm run db:up` starts both databases, `npm run db:setup` creates the roles and applies migrations, and the tests pass against the test database
- [ ] `GET /health` and `GET /health/ready` work. Readiness reaches the real Postgres as the limited `ledger_app` role
- [ ] The app role is not a superuser, cannot create tables, and cannot touch the migration history (test)
- [ ] Unknown routes use the standard error body. A 500 hides internal details
- [ ] The OpenAPI file is valid, and the routes match it (test)
- [ ] `docker build` works, and the image runs as a non-root user
- [ ] CI is green on GitHub, with a Postgres 17 service
- [ ] Branch protection on `main` requires a PR and the CI check
- [ ] Secret scanning and push protection are on (if the plan allows)
- [ ] `.env` is not tracked by git (`git status` shows nothing for it)

Complex parts (CLI execution with extra oversight / Claude escalation if blocked):
None. This feature was built and checked by the planner.

Review log:
- Local check by Claude, on PostgreSQL 17.10: lint, typecheck, format, OpenAPI validation, 35 tests, and build pass. Also checked: a clean `npm ci`; the built server started with only environment variables and shut down cleanly; the Dockerfile stages replayed by hand (build, production-only install, run, migrate); a busy transaction was stopped at exactly 20 seconds; the lint rules reject float math.
- **Not verified yet** (no Docker on that machine): `docker compose up`, `docker build`, and the GitHub Actions run. The first CI run is the real test.
- Pass 1 (owner):
- Pass 2 (owner):
