# DEC-0018: OpenAPI 3.0 contract first, with a drift test

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Decision

- The API is described in `openapi/ledger.v1.yaml` (OpenAPI 3.0.3). It is the source of truth.
- A feature PR changes the spec and the code together.
- CI validates the spec (`npm run openapi:lint`).
- A test checks that the routes the app serves are exactly the routes the spec documents (INV-16).
- A test checks that every `POST` uses the `Idempotency-Key` parameter, and that every operation has a unique `operationId`.
- Paths start with `/v1`. Changes inside `/v1` are additive only.
- Generated clients and consumer contract tests are added when the first client service starts.

## Rejected options

- Code-first (generate the spec from code). The contract would follow accidental code changes.
- OpenAPI 3.1. Its tooling support in PHP and Python generators is weaker today. We can move later.
- No spec. Three languages would drift.

## Why

The spec is how the gateway (PHP) and reconciliation (Python) will learn the API without reading TypeScript.

## Trade-offs and risks

The drift test checks routes, not every field. Full response validation against the schemas (for example with a property-based API tester) is added in the hardening feature (F9).
