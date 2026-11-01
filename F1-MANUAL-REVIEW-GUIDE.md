# F1 Manual Review Guide

This guide is for a deliberate, manual review of the ledger project before
starting the next feature. Its purpose is not to tell you that the code is
correct. Its purpose is to help you prove what the system does, why it does
it, what changed, and where your own engineering judgment should challenge it.

Read this document beside the code. Keep a notebook of:

- What you believe the code guarantees.
- Which line proves that guarantee.
- Which test would fail if the guarantee were removed.
- What assumption the design makes.
- What you would change, and why.

The ledger handles money. A passing test suite is evidence, not proof of
production safety.

---

## 1. Current state in one page

The repository is a monorepo. Only `services/ledger` is active. The gateway
and reconciliation services are deliberately not built.

The ledger is currently at:

- Phase 2 skeleton complete.
- F1 implementation and review work present.
- F1 feature status still `todo`.
- F1 checklist intentionally still unticked.
- Review Pass 1 and Pass 2 recorded in the F1 feature file.
- Worktree was clean after the last documentation commits.

The current F1 system provides:

1. A PostgreSQL `clients` table.
2. Random API keys with the format `lk_` plus 43 base64url characters.
3. SHA-256 storage of the complete key; plaintext is not stored.
4. An eight-character display prefix, calculated as `key.slice(0, 8)`.
5. Authentication in Fastify's global `onRequest` hook.
6. Default deny for every path except exact `GET` and `HEAD` health paths.
7. Route-declared access: `public`, `any-client`, `ledger:read`, or
   `ledger:write`.
8. Exact scopes. `ledger:write` does not imply `ledger:read`.
9. `GET /v1/whoami`.
10. Operator commands to create, list, and revoke clients.
11. Standard error bodies with a request ID.
12. Redaction of the `Authorization` header.
13. Database constraints and least-privilege roles.
14. OpenAPI documentation and route-drift tests.
15. Tests against a real PostgreSQL database.

Current validation previously passed:

```text
npm run lint
npm run format:check
npm run typecheck
npm run openapi:lint
npm test
npm run build
```

The full suite has reached 12 test files and 76 tests passing. Re-run it
yourself during the review. Do not treat this document as a substitute for
the commands.

---

## 2. Read the project in this order

Do not begin with implementation files. Start with the intended behavior.

### A. Rules and process

1. Root `AGENTS.md`
2. `services/ledger/AGENTS.md`
3. `CONTRIBUTING.md`
4. `docs/process/feature-loop.md`
5. `docs/process/kickoff-prompts.md`
6. `docs/production-readiness.md`

Ask: who is allowed to decide the behavior, who writes code, and what is
required before a feature can be called done?

### B. Product and architecture

1. Root `README.md`
2. `services/ledger/README.md`
3. `services/ledger/docs/prd.md`
4. `services/ledger/docs/rfc-001.md`
5. `services/ledger/docs/invariants.md`
6. `services/ledger/docs/roadmap.md`
7. `services/ledger/docs/versions.md`

Ask: what is promised now, what is explicitly later, and what must never be
weakened?

### C. F1 decisions

Read these decision records before the F1 code:

1. `0013-clients-and-api-key-auth.md`
2. `0016-database-roles-least-privilege.md`
3. `0017-migrations-node-pg-migrate.md`
4. `0018-openapi-contract-first.md`
5. Platform decisions under root `docs/decisions/`

The important current addendum is at the end of
`0013-clients-and-api-key-auth.md`: scopes are exact and do not imply each
other.

### D. Feature contract

Read all of:

```text
services/ledger/docs/features/F01-clients-auth.md
services/ledger/migrations/20261031050000_create-clients.sql
services/ledger/openapi/ledger.v1.yaml
```

Only then read the source and tests.

---

## 3. The core mental model

### 3.1 Database roles

There are three important roles:

| Role | Purpose | Used by |
|---|---|---|
| `ledger_admin` | Creates roles and databases during setup | bootstrap only |
| `ledger_migrator` | Owns tables and runs migrations | migrations and operator tools |
| `ledger_app` | Runs the HTTP service | application pool |

The application must not use the migrator role. The app can read `clients`,
but it cannot insert, update, or delete clients.

This separation means a running HTTP vulnerability should not automatically
give an attacker the ability to create or revoke credentials.

### 3.2 API-key lifecycle

Creation:

1. The operator validates a client name and scopes.
2. The program generates 32 random bytes.
3. It encodes them as base64url.
4. It prefixes the result with `lk_`.
5. It computes:
   - `key_prefix = key.slice(0, 8)`;
   - `key_hash = SHA-256(key)`.
6. It stores only the prefix and hash.
7. It prints the full key once.

Authentication:

1. The request is checked against the exact public-health rule.
2. Every other request must have `Authorization: Bearer <full-key>`.
3. The full key is hashed.
4. PostgreSQL searches by `key_hash` and `status = 'active'`.
5. The client identity and scopes are attached to the request.
6. The route's declared access is checked.

Revocation:

1. An active row is changed to `revoked` atomically.
2. The update returns a row only for the first successful revocation.
3. If no row is returned, a second query distinguishes already revoked from
   unknown.
4. A later request no longer finds the client as active.

### 3.3 Access model

The type is:

```text
public | any-client | ledger:read | ledger:write
```

Meaning:

- `public`: only exact `GET` or `HEAD` health routes may use it.
- `any-client`: any authenticated active client may use it.
- `ledger:read`: the client must explicitly have `ledger:read`.
- `ledger:write`: the client must explicitly have `ledger:write`.

Scopes are sets, not a hierarchy. A write-only client is not a read client.
A client that needs both gets both values in its database array.

### 3.4 Default deny

Only these exact raw requests are public:

```text
GET  /health
HEAD /health
GET  /health/ready
HEAD /health/ready
```

Examples that are not public:

```text
/health/
//health
/health?check=1
/health/%zz
/% 
```

An unknown path without a key returns the standard 401. An unknown path with a
valid key reaches the not-found handler and returns 404. This intentionally
avoids allowing an unauthenticated caller to distinguish known routes from
unknown routes.

---

## 4. File-by-file review map

This section tells you what each tracked file is responsible for and what to
ask while reading it. Read every line in the file itself; this is a map, not a
replacement for the source.

## 4.1 Root files

### `AGENTS.md`

Repository rules for humans and AI tools. Pay attention to:

- only the ledger is active;
- tests must come before implementation;
- invariants and decision records are protected;
- no floating-point money;
- no secrets or destructive commands.

Challenge: are these rules enforced by CI, or only by discipline?

### `CONTRIBUTING.md`

Git, branch, commit, and pull-request rules. Check whether the actual commit
history follows it.

### `README.md`

Platform map and warning that a passing build is not launch approval. It points
to production readiness and the ledger service.

### `docs/architecture-assessment.md`

Why the platform is split into services and what risks were considered.
Challenge the boundaries: does the ledger know only ledger facts?

### `docs/production-readiness.md`

The future real-money launch gate. F1 is not that gate.

### `docs/process/feature-loop.md`

The required loop: spec, tests first, implementation, review, done check,
merge. Compare the actual F1 history with this loop.

### `docs/process/kickoff-prompts.md`

The prompts and responsibilities used for feature work. Check whether a later
feature should repeat the same discipline.

### `docs/decisions/P-0001` through `P-0007`

Platform-level decisions: monorepo, independent services, data ownership,
contract-first HTTP, CI/releases, production readiness, and AI-assisted
execution.

Challenge: which decisions are permanent constraints and which are only
current conveniences?

## 4.2 Ledger configuration and setup

### `services/ledger/AGENTS.md`

Service-specific non-negotiable rules. Use it as a review checklist:

- Node and TypeScript stack;
- PostgreSQL with plain SQL;
- real database tests;
- no ORM;
- least privilege;
- every error has the standard shape;
- every POST eventually needs idempotency;
- no money as JavaScript `number`.

### `services/ledger/package.json`

Defines the service commands and dependency boundary.

Review each script:

- `dev`, `start`: environment loading and server entry point;
- `build`, `typecheck`, `lint`, `format`: static checks;
- `test`: Vitest;
- `db:*`: Docker/bootstrap/setup;
- `client:*`: operator CLI;
- `migrate*`: forward-only SQL migrations;
- `openapi:lint`: contract validation.

The exact client scripts are:

```text
client:create -> tsx --env-file-if-exists=.env scripts/client-admin.ts create
client:revoke -> tsx --env-file-if-exists=.env scripts/client-admin.ts revoke
client:list   -> tsx --env-file-if-exists=.env scripts/client-admin.ts list
```

### `package-lock.json`

Dependency resolution. Do not manually edit it to solve application behavior.
Ask why every dependency exists.

### `.env.example`

Documents local variables. Never commit or expose the real `.env`.

### `docker-compose.yml`

Defines development and test PostgreSQL instances. Confirm ports, health
checks, database names, and persistence behavior.

### `Dockerfile`

Build/runtime image definition. Check whether the runtime image contains only
what it needs and whether secrets are excluded.

### `eslint.config.js`, `.prettierrc.json`, `.prettierignore`,
`.npmrc`, `.nvmrc`, `tsconfig.json`, `tsconfig.build.json`

These define language version, formatting, lint policy, build boundaries, and
the npm output behavior used by exact CLI tests.

### `services/ledger/BACKLOG.md`

Deferred items. They are not current implementation requirements:

- reject malformed token format before the database query;
- accept lowercase/mixed-case bearer scheme;
- narrow logger option typing;
- move type imports to the top of `app.ts`;
- return 503 for authentication database outages;
- include the auth query in F9 benchmarking;
- move most CLI tests in-process;
- prevent cleanup from hiding an original CLI error;
- document query-string health probes returning 401.

When reviewing, do not silently implement backlog items unless the owner
promotes them into the feature requirements.

### `CHANGELOG.md`

Release-facing record. F1 has not been declared done, so verify whether its
entry and feature status should be finalized only after the owner's done check.

## 4.3 Database and scripts

### `migrations/20261031050000_create-clients.sql`

Read every column and constraint:

- UUID primary key.
- Unique client name.
- `key_prefix` for display only.
- Unique binary `key_hash`.
- Non-empty scopes limited to the two known scopes.
- Status limited to active/revoked.
- Creation timestamp.
- Nullable revocation timestamp.
- Equality constraint requiring revoked status and timestamp to agree.
- `GRANT SELECT` only to `ledger_app`.

Challenge:

- Is `key_prefix` length constrained in the database, or only produced
  correctly by code?
- Is SHA-256 acceptable for high-entropy random keys?
- Is a unique hash collision error handled safely?

### `scripts/lib/bootstrap.ts`

Creates roles and applies safe role defaults. Verify ownership, privileges,
connection restrictions, and timeout defaults.

### `scripts/lib/migrate.ts`

Runs migrations with the migrator URL. Check that migrations are ordered and
fail safely.

### `scripts/db-bootstrap.ts`

Thin command-line wrapper for role/database setup. Check that it does not
print credentials.

### `scripts/validate-openapi.ts`

Parses and validates the YAML contract. It should fail on invalid OpenAPI,
not silently accept malformed documentation.

### `scripts/lib/client-admin.ts`

This is the operator business logic:

- validates names and scopes;
- creates random keys;
- writes only hashes and prefixes;
- prints the key exactly once;
- lists safe fields only;
- revokes atomically;
- maps expected input/business errors to exit code 1;
- maps unexpected errors to exit code 2;
- avoids printing database URLs or passwords;
- uses the migrator connection.

Read each `client.end()` in the `finally` blocks. Ask whether cleanup can
replace an original error. This is already a backlog item.

### `scripts/client-admin.ts`

Thin wrapper. It passes process arguments, environment, stdout, and stderr to
`runClientAdmin`, then sets `process.exitCode`.

## 4.4 Application source

### `src/config.ts`

Loads and validates `APP_ENV`, `APP_PORT`, `APP_HOST`, and `DATABASE_URL`.
It collects all configuration errors before throwing.

Challenge: `Number(rawPort)` is appropriate for a port, but remember that money
must never follow this pattern.

### `src/db/pool.ts`

Creates the single application pool using the limited app role and database
timeouts. Check max pool size, connection timeout, statement timeout, lock
timeout, and idle transaction timeout.

### `src/db/timeouts.ts`

Central timeout constants. Understand why the transaction timeout is a role
default rather than a pool option.

### `src/server.ts`

Production entry point:

1. Loads configuration.
2. Creates the app pool.
3. Builds the Fastify app.
4. Logs pool errors.
5. Registers SIGINT/SIGTERM shutdown.
6. Starts listening.

Challenge shutdown ordering and what happens if `app.close()` or `pool.end()`
fails.

### `src/auth/types.ts`

The source type definitions for scopes, route access, and the authenticated
request client. Verify that database values are narrowed to these types by
constraints and code.

### `src/auth/keys.ts`

Three small functions:

- `generateApiKey()`: secure random bytes and base64url.
- `hashApiKey()`: complete key to SHA-256 bytes.
- `apiKeyPrefix()`: first eight characters.

Manually prove that the prefix includes `lk_`, is not an authenticator, and is
never queried as a credential.

### `src/auth/access.ts`

Defines public paths and two decisions:

- `isPublicRequest()`: exact method, exact route path, exact raw URL.
- `hasAccess()`: checks route metadata against the authenticated client's
  explicit scopes.

Challenge what happens if a route forgets metadata. The `onRoute` hook in
`app.ts` is the fail-fast protection.

### `src/auth/authenticate.ts`

Authentication flow:

1. Read the `Authorization` header.
2. Require the current Bearer format.
3. Hash the complete key.
4. Query active clients by hash.
5. Attach the identity.
6. Reject missing scopes with 403.

Current backlog behavior to notice:

- token format is not pre-validated before the query;
- Bearer matching is case-sensitive;
- database errors are not yet explicitly mapped to 503.

These are documented questions/backlog items, not hidden behavior.

### `src/app.ts`

Composition root. Read in this order:

1. Fastify imports and module augmentation.
2. `AppDeps` and ignored methods.
3. logger construction and redaction;
4. custom `frameworkErrors`;
5. request ID generation;
6. route table decoration;
7. `onRoute` metadata validation;
8. request ID hook;
9. registration order for errors, authentication, health, and whoami.

Important security properties:

- route without access metadata throws during registration;
- public access is restricted to exact health routes;
- malformed URL framework errors return a safe standard 401;
- authorization is redacted as `[Redact]`;
- every request gets a server-generated ID.

Challenge whether the custom logger merge is safe for every accepted Fastify
logger type. This is backlog-listed.

### `src/http/errors.ts`

Owns:

- `errorBody()`;
- `ApiError`;
- standard not-found responses;
- standard API error responses;
- 401 `WWW-Authenticate`;
- hiding internal error details.

Check that no raw database or stack detail reaches the client.

### `src/http/health.ts`

Public liveness and readiness:

- `/health` does not touch the database;
- `/health/ready` runs `SELECT 1`;
- readiness returns 503 with the standard error shape when the database is
  unavailable.

The exact query-string behavior is deliberate and belongs in the runbook
later: `/health?check=1` is not the public route.

### `src/http/whoami.ts`

Authenticated identity endpoint. It returns only:

```json
{
  "client_id": "...",
  "name": "...",
  "scopes": ["ledger:read"]
}
```

Challenge whether any future identity fields could leak sensitive operator
information.

## 4.5 API contract

### `openapi/ledger.v1.yaml`

The contract currently documents:

- public health routes;
- `/v1/whoami`;
- bearer authentication;
- standard error responses;
- request IDs;
- future money and idempotency schemas.

Compare this file with:

1. `src/http/*.ts`;
2. route-table tests;
3. the F1 feature file;
4. `docs/rfc-001.md`.

Ask: if the code and OpenAPI disagree, which one would a client generator
trust? The project rule says the OpenAPI contract is the source of truth.

## 4.6 Tests

### `test/auth-keys.test.ts`

Tests key format, uniqueness of 1,000 generated keys, secure generation
expectations, full-key hashing, and prefix non-authentication.

### `test/clients-auth.test.ts`

Main F1 security suite. Read every test name and map it to a requirement:

- identical invalid-credential 401s;
- public health routes;
- health variants not public;
- route access metadata;
- all registered non-public routes protected;
- unknown path default deny;
- malformed and 2 MB body requests rejected before parsing;
- malformed URLs safely rejected;
- public access declaration rejected on non-health routes;
- body parsing order;
- non-prefix route protection;
- log redaction;
- valid whoami;
- valid-key unknown path 404;
- custom serializer redaction;
- identical 401 details and request IDs;
- successful and failed log capture;
- positive read scope;
- positive write scope;
- missing scope 403;
- revocation takes effect immediately.

For every state-changing test, inspect the `try/finally` cleanup.

### `test/clients-migration.test.ts`

Tests:

- exact client columns;
- app-role SELECT-only privilege;
- plaintext and encoded-key absence;
- SHA-256 hash and exact prefix;
- empty scope rejection;
- unknown scope rejection;
- status/revocation consistency;
- duplicate name;
- duplicate hash;
- cleanup after constraint tests.

### `test/client-admin.test.ts`

Tests exact CLI output and exit codes for:

- create;
- invalid names;
- unknown scopes;
- duplicate names;
- list formatting and secrecy;
- revoke and idempotent revoke;
- unknown names;
- unexpected connection errors without credential leakage;
- concurrent revoke behavior and timestamp preservation.

Notice that CLI tests use real npm subprocesses. This is slower but verifies
the actual command path. The backlog proposes moving most cases in-process
while keeping one or two smoke tests.

### `test/errors.test.ts`

Tests standard unknown-route 404 and hidden internal 500 details.

### `test/health.test.ts`

Tests liveness, readiness, request IDs, request-ID replacement, and database
down behavior.

### `test/f01-openapi.test.ts` and `test/openapi.test.ts`

Check F1 contract details and route/documentation drift.

### `test/config.test.ts`

Checks configuration defaults, complete reads, required database URL, invalid
environment, and invalid ports.

### `test/db-roles.test.ts`

Checks role privilege boundaries and timeout defaults.

### `test/migrations.test.ts`

Checks migration ordering, repeatability, failure handling, naming, and
forward-only policy.

### `test/package-scripts.test.ts`

Protects exact `client:*` script strings, portable paths, and the exact
`--env-file-if-exists` spelling.

### `test/global-setup.ts`, `test/setup.ts`, and `test/helpers/db.ts`

These prepare the real test database:

1. Load local environment values if present.
2. Bootstrap roles.
3. Apply migrations.
4. Create app-role pools for tests.

Challenge whether test cleanup is complete when a test fails midway. This is
why per-test `finally` blocks and pre-cleaning matter.

### `vitest.config.ts`

Controls test discovery, global setup, setup files, serial file execution,
and timeouts. Review the timeout values as test count grows.

---

## 5. Manual line-by-line method

Use this method for every file. Do not simply read top to bottom once.

### Pass A: vocabulary

For every identifier, write:

- What type is it?
- Who creates it?
- Who can change it?
- What is its lifetime?
- Is it trusted input, untrusted input, or derived data?

Example:

```text
request.client
type: AuthenticatedClient | undefined
created by: authenticate()
changed by: no later code in F1
trust: database-backed identity after active-key lookup
```

### Pass B: control flow

For each function, mark:

1. Entry conditions.
2. Validation.
3. Side effects.
4. Database calls.
5. Errors thrown.
6. Cleanup.
7. Return value.

For each `try`, `catch`, and `finally`, ask whether the original error can be
lost.

### Pass C: trust boundaries

Mark every boundary:

- HTTP headers into application code;
- raw URL into route matching;
- API key into hashing;
- database result into TypeScript objects;
- operator arguments into SQL parameters;
- logger request objects into output;
- environment variables into configuration.

At every boundary ask: what if the value is missing, malformed, huge,
duplicated, encoded differently, or malicious?

### Pass D: invariant proof

For each rule in `docs/invariants.md`, find:

- implementation line;
- database constraint or role grant;
- test;
- failure mode.

If one of the four is missing, record it as a review question.

### Pass E: mutation thought experiment

Mentally delete or weaken one line:

- remove `status = 'active'`;
- use `key_prefix` instead of `key_hash`;
- remove the route metadata check;
- make `/health?x=1` public;
- remove the `finally` cleanup;
- return the raw error;
- let the app use the migrator role.

Which test should fail? If no test fails, the proof is incomplete.

### Useful Windows commands

Run from the repository root:

```powershell
Get-Content .\services\ledger\src\app.ts
Get-Content .\services\ledger\src\auth\authenticate.ts
```

Show line numbers:

```powershell
$i = 1
Get-Content .\services\ledger\src\app.ts |
  ForEach-Object { "{0,5}: {1}" -f $i++, $_ }
```

Search a symbol:

```powershell
rg "hasAccess|isPublicRequest|hashApiKey|routeTable" services\ledger
```

Show a commit:

```powershell
git show --stat <commit>
git show <commit> -- services/ledger/src services/ledger/test
```

Check the current state:

```powershell
git status --short
git diff
git --no-pager log --oneline --decorate -20
```

Never print `.env`, credentials, or database URLs into a shared transcript.

---

## 6. Change history and why it changed

Use this history to understand evolution rather than assuming the current
code was the first design.

### Skeleton

`a653e80 chore(ledger): add service skeleton, database roles, migrations, and CI`

Created the basic service, roles, migrations, Docker setup, tests, and CI.

### Initial F1 implementation

`dab7d82 fix(ledger): enforce default-deny authentication`

Moved authentication from a route-list idea toward protecting all registered
non-health routes.

### Default-deny documentation

`64362de docs(ledger): require authentication for all paths except health`

Changed INV-11 and the F1 “Done when” rule to include unknown paths and route
access declarations.

### Default-deny coverage

`77c72c8 test(ledger): complete F1 default-deny coverage`

Added broader tests for unknown paths, logging, secret storage, and invalid
credential consistency.

### Planner fixes

`72bcbe6 test(ledger): cover F1 planner findings`

Added tests first for hook behavior, public route validation, atomic revoke,
database constraints, and CLI error secrecy.

`36509e7 fix(ledger): fail closed on request access`

Added `src/auth/access.ts`, moved unknown-path authentication into the global
hook, removed the obsolete `require-scope.ts`, made revoke atomic, and added
safe client error handling.

### Review and backlog records

`6152e89 docs(ledger): record planner review backlog`

Recorded the six deferred backlog items and planner review.

`bb4ae92 test(ledger): cover planner F1 findings`

Added the later full-diff review tests: serializer redaction, positive scopes,
2 MB body coverage, malformed URLs, isolation, and silent CLI execution.

`08126e8 fix(ledger): harden F1 request error handling`

Added custom framework-error handling and redaction behavior, plus cleanup
hardening.

`166eccc fix(ledger): standardize F1 error responses`

Standardized readiness 503 responses, added request IDs to framework errors,
updated OpenAPI, and removed stale `requireScope` wording from F1.

### Current documentation decisions

`4a0b904 docs(ledger): record that scopes are exact`

Recorded the exact-scope decision: write does not imply read.

`d700b6e docs(ledger): add service_unavailable to the error table`

Updated the RFC error table to match the standard readiness response.

`e7565b5 docs(ledger): record F1 review passes`

Recorded Pass 1 and Pass 2 as complete, with nine backlog items.

---

## 7. Where your engineering judgment matters most

These are the places where you should not simply accept generated code.

### Security model

- Is authenticating unknown paths worth one database query?
- Does the route metadata model fail closed for every future route?
- Could a new Fastify lifecycle behavior bypass the hook?
- Are malformed URLs, oversized bodies, and unusual encodings safe?
- Does any log path still expose a key or header?

### Key design

- Is SHA-256 appropriate for 32 random bytes?
- How will rotation work?
- What happens if a key is copied into a shell history, crash dump, or CI log?
- Is the prefix useful without creating accidental trust in it?

### Scope design

- Exact scopes are least privilege and easy to test.
- Would a future scope hierarchy create surprising access?
- Should a route ever need more than one scope?
- What migration is required when a third scope appears?

### Database safety

- Are all important rules enforced in PostgreSQL, not only TypeScript?
- Can two operators race on create or revoke?
- Can cleanup hide a failed operation?
- Are all app privileges still least privilege?
- Are connection and statement failures mapped correctly?

### Error contract

- Are status, code, message, headers, body, and request ID consistent?
- Can an attacker distinguish missing, wrong, unknown, and revoked credentials?
- Does the OpenAPI contract describe every actual response?
- Should authentication database failure be 503 rather than 500?

### Operational usability

- Can an operator recover from a lost key?
- Is client creation auditable?
- Is revoke output safe and unambiguous?
- Are subprocess tests proving the real command path or only making tests slow?
- Are health probes documented exactly enough for deployment systems?

### Testing quality

- Does every test fail if the behavior is removed?
- Does each test clean up state even on assertion failure?
- Are tests isolated from order and parallelism?
- Are failure-path tests stronger than happy-path tests?
- Is any test checking an implementation detail instead of a real guarantee?

---

## 8. Review worksheet

Copy this table into your own notes and fill it in manually.

| Question | Evidence | Your conclusion |
|---|---|---|
| Where is the full API key stored? | | |
| Can the prefix authenticate? | | |
| What exact URLs are public? | | |
| What happens to an unknown path without a key? | | |
| What happens to an unknown path with a valid key? | | |
| Where is authentication executed in Fastify? | | |
| What happens before body parsing? | | |
| How are scopes checked? | | |
| Does write imply read? | | |
| Which role runs the service? | | |
| Which role runs client administration? | | |
| What database rule prevents active plus `revoked_at`? | | |
| What prevents duplicate client names? | | |
| What prevents duplicate key hashes? | | |
| What happens on a second revoke? | | |
| Where are request IDs created? | | |
| Do malformed URL errors include request IDs? | | |
| Where is `Authorization` redacted? | | |
| What is the standard 401 body? | | |
| What is the standard 503 readiness body? | | |
| Which tests prove each answer? | | |

---

## 9. Final personal review checklist

Do not move to the next feature until you can explain each item aloud.

- [ ] I can explain the platform, service boundary, and current roadmap.
- [ ] I can explain every database role and its privileges.
- [ ] I can draw the API-key creation, authentication, and revocation flows.
- [ ] I can explain why the full key is hashed and why the prefix is display-only.
- [ ] I can explain exact scopes and the least-privilege reason.
- [ ] I can explain default deny for unknown paths.
- [ ] I can explain Fastify registration, `onRequest`, `frameworkErrors`, and
      `setNotFoundHandler`.
- [ ] I can explain the standard error body and request-ID behavior.
- [ ] I can explain every constraint in the clients migration.
- [ ] I can explain every client-admin command and exit code.
- [ ] I can map every F1 “Done when” rule to implementation and test evidence.
- [ ] I can name every deferred backlog item and why it is deferred.
- [ ] I can explain every F1 review finding and the change that fixed it.
- [ ] I have challenged at least one security decision, one database decision,
      one API decision, and one testing decision.
- [ ] I have run the full validation commands myself.
- [ ] I have not ticked the F1 checklist merely because the automated tests
      pass.

The goal is not to memorize every line. The goal is to know what every line
protects, what would break if it changed, and whether that protection is
actually the one you want.
