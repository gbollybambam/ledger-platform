# P-0004: HTTP and OpenAPI contracts. Versioned and additive.

- Date: 2026-10-27
- Status: accepted

## Decision

- Services call each other over HTTP and JSON. Each service publishes an OpenAPI 3.0 file in `services/<name>/openapi/`.
- The OpenAPI file is the source of truth. A feature PR changes the file and the code together. A test fails if they disagree.
- Paths are versioned (`/v1`). Changes inside a version are **additive only**: new optional fields, new endpoints. A breaking change needs `/v2`, run side by side with `/v1` until clients move.
- Every POST needs an `Idempotency-Key`.
- Money is an integer string in minor units.
- All errors use one shape: `{ "error": { "code", "message", "request_id" } }`.
- Clients are generated from the OpenAPI file, not written by hand, where a good generator exists.

## Rejected options

- gRPC. Good, but harder to debug by hand and to use from PHP and Python for a first version.
- A shared code library. The languages differ.
- Undocumented JSON. It drifts.

## Why

Three languages need one language-neutral contract.

## Trade-offs and risks

OpenAPI 3.0 has weaker types than code. Contract tests (provider side now, consumer side when a second service exists) are the safety net.
