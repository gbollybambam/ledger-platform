# Changelog

All notable changes to the ledger service are listed here. The format follows Keep a Changelog.
The versions follow Semantic Versioning. Tags look like `ledger/v0.1.0`. See `../../CONTRIBUTING.md`.

## [Unreleased]

### Added
- Planning documents: PRD, RFC-001, invariants, roadmap, version plan, research notes, and decision records DEC-0001 to DEC-0019.
- Service skeleton: TypeScript, Fastify, PostgreSQL 17, Vitest, ESLint with money rules, Prettier.
- Database roles (`ledger_admin`, `ledger_migrator`, `ledger_app`) and a bootstrap command.
- Migration tooling (`node-pg-migrate`, plain SQL, forward-only) with tests.
- OpenAPI contract with validation and a route drift test.
- Health endpoints (`/health`, `/health/ready`), request IDs, and the standard error format.
- Dockerfile (multi-stage, non-root) and CI workflow.
