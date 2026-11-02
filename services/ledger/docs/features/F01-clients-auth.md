# Feature: F1 Clients, API keys, and scopes
Status: done

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
- `src/auth/`: key generation, hashing, an auth hook, route access metadata, and scope checks.
- `src/http/whoami.ts`: `GET /v1/whoami`.
- `scripts/lib/client-admin.ts` with injectable output writers, a thin
  `scripts/client-admin.ts` wrapper, and these npm scripts: `client:create`,
  `client:revoke`, `client:list`.
- `openapi/ledger.v1.yaml`: add `/v1/whoami` and keep the contract valid.
- Tests for every "done when" rule.
- `docs/features/F01-clients-auth.md`: tick the boxes. `CHANGELOG.md`: add an entry.

## Operator tool output

The client administration logic lives in `scripts/lib/client-admin.ts`. Its
output writers are passed in so tests can capture stdout and stderr. The
`scripts/client-admin.ts` file is only a thin command-line wrapper.

Client names:

- Lowercase letters, digits, and hyphens only.
- Length from 2 to 40 characters.
- Must start with a letter.
- Invalid names exit with code 1.

### `client:create --name <name> --scopes <scopes>`

On success, exit with code 0 and print exactly this structure to stdout:

```text
client created
id:      <uuid>
name:    <name>
scopes:  <comma-separated, sorted>
prefix:  <first 8 characters of the key>
api_key: <the full key>
```

Print this exact line to stderr:

```text
Save this key now. It cannot be shown again.
```

The full key appears exactly once in stdout, on the `api_key` line. It must
not appear anywhere else, including stderr, files, or logs.

### `client:list`

Print a header, followed by one line per client sorted by name. Columns are
`NAME`, `ID`, `PREFIX`, `SCOPES`, `STATUS`, and `CREATED`. Columns are
separated by two spaces and padded to the widest value. `CREATED` is ISO 8601
in UTC. With no clients, print:

```text
no clients
```

The output must never contain a plaintext API key or a stored key hash.

### `client:revoke --name <name>`

On a successful first revocation, print to stdout and exit with code 0:

```text
client revoked: <name>
```

If the client is already revoked, preserve the original `revoked_at`, print to
stdout, and exit with code 0:

```text
client already revoked: <name>
```

If the name is unknown, print to stderr and exit with code 1:

```text
client not found: <name>
```

### Errors and exit codes

Errors go to stderr on one line, with no stack trace. They must never contain
an API key, a hash, or a database URL.

- `0`: success.
- `1`: invalid input or a business error, including duplicate names, unknown
  scopes, or unknown clients.
- `2`: unexpected error.
- Unknown scopes must name the invalid scope and list the allowed scopes.
- Duplicate names must say:
  `a client named "<name>" already exists`.
- Missing `MIGRATION_DATABASE_URL` must name the variable without printing its
  value.

Tests must check the exact output lines and exit codes for each case. They must
also check that the create key appears exactly once in stdout and nowhere in
stderr, and that list and revoke output never contain a plaintext key or a
hash in hexadecimal or base64 form.

Done when:
- [x] All rules in docs/invariants.md still hold
- [x] The migration creates `clients` exactly as in RFC-001, and gives `ledger_app` only `SELECT`. A test as `ledger_app` shows `INSERT`, `UPDATE`, and `DELETE` on `clients` fail with permission denied (42501)
- [x] Key format is `lk_` followed by 43 base64url characters from `crypto.randomBytes(32)`. Unit tests check the format and that 1,000 keys are all different. `Math.random` is not used
- [x] The database stores only the SHA-256 hash and an 8-character prefix. A test reads every column of the client row and finds no plaintext key
- [x] `GET /v1/whoami` with a valid key returns 200 and `{ "client_id", "name", "scopes" }`
- [x] A missing header, a wrong scheme, an unknown key, and a revoked key all return 401 `unauthorized` with an identical body shape and message. The body does not say which case it was
- [x] Revoking a client takes effect on the very next request (no caching). A test revokes a client and calls again
- [x] Every non-public route declares `access: 'any-client' | 'ledger:read' | 'ledger:write'`. A test-only route with each ledger scope returns 200 for the matching scope and 403 `forbidden` for the other scope. Test routes are not shipped
- [x] `/health` and `/health/ready` stay public
- [x] Authentication runs before the body is parsed (an `onRequest`-level hook), and every error uses the standard error body with a `request_id`
- [x] The `Authorization` header and the key never appear in logs. A test captures the logs of a successful and a failed request and searches for the key (INV-14)
- [x] `npm run client:create -- --name gateway --scopes ledger:read,ledger:write` prints the key once and never again. It rejects unknown scopes and duplicate names. `client:revoke -- --name gateway` revokes. `client:list` prints name, prefix, scopes, status, and never a hash. The tools use `MIGRATION_DATABASE_URL`
- [x] Default deny: every request except the two public health routes returns 401 without a valid key, including unknown paths. A route with no access declaration stops the app from starting
- [x] The OpenAPI file documents `/v1/whoami` with `bearerAuth`, 401, and 403. `npm run openapi:lint` and the route drift test pass (INV-16)
- [x] `npm run lint`, `typecheck`, `format:check`, `test`, and `build` pass. CI is green

Complex parts (CLI execution with extra oversight / Claude escalation if blocked):
- **Key generation and hashing.** Small, but a flaw here weakens everything. After the code is written, the planner reviews these files before the feature is called done.
- **Same 401 for every failure.** Different messages let an attacker learn which keys exist. Check the body and the response timing shape.
- **Log redaction.** Check what the logger prints by default, and prove it with the log-capture test. Do not assume.
- **Hook order.** Authentication must run before body parsing and before any route handler.

Review log:
- Pass 1 (CLI): default deny, test gaps. Planner review: 13 fix-now, all fixed.
- Pass 2 (CLI): 3 fix-now (standard 503 body, request ID on framework errors, stale spec text), all fixed. 9 items in the backlog.
