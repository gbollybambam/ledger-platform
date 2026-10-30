# Feature: F1 Clients, API keys, and scopes
Status: todo

Goal:
Every request to the ledger is made by a known client with the right scope. Keys are stored only as hashes. An operator can create, list, and revoke clients. This is built first so that every later endpoint is born protected.

Out of scope:
- Rate limiting and lockout for failed attempts (v1.1).
- Key rotation with two active keys (v1.1).
- An audit log table (v1.1).
- JWTs, OAuth, mTLS, user login.
- Any account or transaction endpoint (F2 and later).
- Per-client data isolation. All clients can read all accounts (see RFC "Known limits").

Reads first (in this order):
1. `docs/decisions/0013-clients-and-api-key-auth.md`
2. `docs/decisions/0016-database-roles-least-privilege.md`
3. `docs/decisions/0017-migrations-node-pg-migrate.md`
4. `docs/rfc-001.md`: sections "Roles and privileges", "Data model" (the `clients` table), "Authentication"
5. `docs/invariants.md`: INV-11, INV-12, INV-14, INV-16

Expected changes:
- `migrations/<timestamp>_create-clients.sql`: the `clients` table exactly as in RFC-001. Then `GRANT SELECT ON clients TO ledger_app;`. Nothing else. Create it with `npm run migrate:create -- create-clients`.
- `src/auth/`: key generation, hashing, an auth hook, and `requireScope`.
- `src/http/whoami.ts`: `GET /v1/whoami`.
- `scripts/client-admin.ts` and these npm scripts: `client:create`, `client:revoke`, `client:list`.
- `openapi/ledger.v1.yaml`: add `/v1/whoami` and keep the contract valid.
- Tests for every "done when" rule.
- `docs/features/F01-clients-auth.md`: tick the boxes. `CHANGELOG.md`: add an entry.

Done when:
- [ ] All rules in docs/invariants.md still hold
- [ ] The migration creates `clients` exactly as in RFC-001, and gives `ledger_app` only `SELECT`. A test as `ledger_app` shows `INSERT`, `UPDATE`, and `DELETE` on `clients` fail with permission denied (42501)
- [ ] Key format is `lk_` followed by 43 base64url characters from `crypto.randomBytes(32)`. Unit tests check the format and that 1,000 keys are all different. `Math.random` is not used
- [ ] The database stores only the SHA-256 hash and an 8-character prefix. A test reads every column of the client row and finds no plaintext key
- [ ] `GET /v1/whoami` with a valid key returns 200 and `{ "client_id", "name", "scopes" }`
- [ ] A missing header, a wrong scheme, an unknown key, and a revoked key all return 401 `unauthorized` with an identical body shape and message. The body does not say which case it was
- [ ] Revoking a client takes effect on the very next request (no caching). A test revokes a client and calls again
- [ ] `requireScope('ledger:read' | 'ledger:write')` can be used on a route. A test registers a test-only route and shows 403 `forbidden` when the scope is missing. That test route is not shipped
- [ ] `/health` and `/health/ready` stay public
- [ ] Authentication runs before the body is parsed (an `onRequest`-level hook), and every error uses the standard error body with a `request_id`
- [ ] The `Authorization` header and the key never appear in logs. A test captures the logs of a successful and a failed request and searches for the key (INV-14)
- [ ] `npm run client:create -- --name gateway --scopes ledger:read,ledger:write` prints the key once and never again. It rejects unknown scopes and duplicate names. `client:revoke -- --name gateway` revokes. `client:list` prints name, prefix, scopes, status, and never a hash. The tools use `MIGRATION_DATABASE_URL`
- [ ] The OpenAPI file documents `/v1/whoami` with `bearerAuth`, 401, and 403. `npm run openapi:lint` and the route drift test pass (INV-16)
- [ ] `npm run lint`, `typecheck`, `format:check`, `test`, and `build` pass. CI is green

Complex parts (CLI execution with extra oversight / Claude escalation if blocked):
- **Key generation and hashing.** Small, but a flaw here weakens everything. After the code is written, the planner reviews these files before the feature is called done.
- **Same 401 for every failure.** Different messages let an attacker learn which keys exist. Check the body and the response timing shape.
- **Log redaction.** Check what the logger prints by default, and prove it with the log-capture test. Do not assume.
- **Hook order.** Authentication must run before body parsing and before any route handler.

Review log:
- Pass 1: findings, fixed, moved to backlog
- Pass 2: findings, fixed, moved to backlog
