# P-0005: CI per service and tags per service

- Date: 2026-10-27
- Status: accepted

## Decision

- One workflow file per service: `.github/workflows/<service>-ci.yml`.
- While there is one service, its workflow runs on **every** pull request. There is no path filter.
- Every workflow runs: lint, format check, typecheck (if the language has one), tests against a real PostgreSQL, build, dependency audit, and a Docker image build.
- Tags are per service: `ledger/v0.1.0`. Each service has its own `CHANGELOG.md`.
- Docs-only changes still run CI.

## Rejected options

- A path filter now. A required check that is skipped by a path filter stays "pending" and blocks the merge. If a path filter is added later, it needs a final "gate" job that always runs and is the only required check.
- One tag for the whole repository.

## Why

Simple and safe. A skipped required check is a trap.

## Trade-offs and risks

CI time grows with each service. Add a gate job and path filters when it hurts.
