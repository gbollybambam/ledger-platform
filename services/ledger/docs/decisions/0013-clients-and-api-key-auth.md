# DEC-0013: Clients and API-key authentication are in v1

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Decision

Every caller is a **client**: a row in the `clients` table with a name, a set of scopes, and a status. A client authenticates with an API key in `Authorization: Bearer <key>`.

- Keys are random: `lk_` plus 32 random bytes in base64url. They are shown once, when the client is created.
- Only the SHA-256 hash of a key is stored, with a short prefix to recognize it. The key itself is never stored or logged.
- Scopes in v1: `ledger:read` and `ledger:write`.
- Every account and transaction records the client that created it.
- Idempotency keys and `external_ref` values are scoped per client.
- Clients are created and revoked by an operator tool that uses the migrator role. The running service can only read the `clients` table.
- Revoking a client takes effect on the next request. There is no cache.

## Rejected options

- One shared API key. Separate services need separate identities, and one leaked key would give everything.
- Authentication in v1.1. The earlier plan. With several services and real money, auth cannot come later. It would force a retrofit of every endpoint.
- JWTs. They add key management and expiry rules that a service-to-service API does not need yet.
- A slow password hash (bcrypt, argon2). API keys are long and random, so a fast hash is safe. A slow hash would only add latency to every request.

## Why

It gives per-service identity, least privilege (the recon service gets read-only), attribution, and safe revocation, without a large system.

## Trade-offs and risks

Keys must be stored well by clients and rotated. Rate limiting for failed attempts, an audit log, and mTLS are planned (see `docs/versions.md`). Until then, a TLS-only network path and strong keys are required (see `docs/production-readiness.md`).
