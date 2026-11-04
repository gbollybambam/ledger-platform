# Feature: F2 Idempotency framework
Status: todo

## Goal
Any write endpoint can be made safe to retry with one wrapper. The same request with the same key from the same client is applied **once**, and later calls replay the first response. A different request with that key is refused. This is built **before** accounts and transactions, so every money-moving endpoint is idempotent from its first line.

## Out of scope
- Accounts, currencies, transactions, or any real endpoint (F3 and later). The only POST route in this feature exists in tests.
- Deleting old keys (v1.1). Keys are kept forever in v1.
- Limits on stored response size.
- Idempotency for `GET`.
- The `transaction_id` column (F4 adds it, because the `transactions` table does not exist yet).
- Rate limiting.

## Reads first
1. `docs/decisions/0005-idempotency-in-postgres.md`
2. `docs/decisions/0016-database-roles-least-privilege.md`
3. `docs/decisions/0017-migrations-node-pg-migrate.md`
4. `docs/rfc-001.md`: "Posting a transaction" (steps 4 to 9 and the rules), "Data model" (`idempotency_keys`), "Error mapping"
5. `docs/invariants.md`: INV-05, INV-07, INV-14, INV-16
6. `docs/patterns.md` (all sections) and `../../docs/process/review-checklist.md`
7. `src/auth/authenticate.ts`, `src/http/errors.ts`, `src/app.ts` (how hooks, errors, and routes fit together)

## Decisions already made (do not ask)
1. **Names and places.** `src/idempotency/` holds `canonical-json.ts`, `request-hash.ts`, `key.ts`, `with-idempotency.ts`, and `run-idempotent.ts`. Database error mapping is `src/http/db-errors.ts`.
2. **Key header.** `Idempotency-Key`. It must match `^[A-Za-z0-9._:-]{8,128}$`. Missing, empty, repeated (two headers), too short, too long, or bad characters: 400 `invalid_request`. The messages are exactly `Idempotency-Key header is required` (missing or empty) and `Idempotency-Key header is not valid` (everything else). The message never contains the value.
3. **Request hash.** Lowercase hex SHA-256 of the UTF-8 text `METHOD + "\n" + URL + "\n" + canonicalJson(body)`. `METHOD` is upper case. `URL` is `request.raw.url` exactly as received (path and query string). `body` is the parsed body, or `null` when there is no body.
4. **Canonical JSON.** Object keys sorted by UTF-16 code unit order (the default `Array.prototype.sort()` order), recursively. No spaces. Arrays keep their order. Numbers must be finite. Anything that is not JSON (`undefined`, functions, `bigint`, `NaN`, `Infinity`) throws a `TypeError`.
5. **What is stored.** Only requests that **commit**. A request that fails for any reason leaves no key (INV-05, DEC-0005). Stored: `response_code` (a 2xx status) and `response_body` (JSON).
6. **Replay.** The handler is **not** run again. The reply has the stored status and a body that is the same JSON **value** (not necessarily the same bytes: `jsonb` reorders keys). The reply has the header `Idempotent-Replayed: true`. The first reply has no such header.
7. **Authentication first.** The existing hook runs before everything. A request without a valid key never touches `idempotency_keys`. Replay does not skip authentication or scope checks.
8. **Scope.** Keys are unique per `(client_id, key)`.
9. **Transaction.** The wrapper owns `BEGIN` and `COMMIT` at `READ COMMITTED`. The callback receives the `PoolClient` and must use it for all of its SQL. The wrapper always `ROLLBACK`s on error and always releases the client in `finally`. If `ROLLBACK` or `COMMIT` itself fails, release with `release(true)` to destroy the connection.
10. **jsonb parameters.** Always pass `JSON.stringify(value)` for a `jsonb` parameter. The `pg` driver turns JavaScript arrays into Postgres arrays, which breaks `jsonb`.
11. **Database errors.** `55P03` (lock timeout), `40P01` (deadlock), and `25P04` (transaction timeout) become 503 `busy`, message `The service is busy. Retry with the same Idempotency-Key.`, with the header `Retry-After: 1`. Any other database error is a 500 `internal_error` with the standard generic message. The error handler uses `mapDbError()`.
12. **Table.** The migration below, exactly. No `transaction_id` yet.
13. **Test-only route.** `POST /v1/test-only/idempotent`, declared in tests with `access: 'ledger:write'`. It never appears in `src/`.
14. **Logging.** The key value is never logged. The request log may include `replayed: true|false`.
15. **Misuse.** `runIdempotent` throws a programming `Error` if `request.method` is not `POST` or `request.client` is missing. `run` is never called in that case.
16. **Spec.** The `IdempotencyKey` parameter in `openapi/ledger.v1.yaml` gets `pattern: '^[A-Za-z0-9._:-]{8,128}$'`. Add the response header `IdempotentReplayed` and the response `Busy` (503, with `Retry-After`) to `components`. Add a `Conflict` description for `idempotency_key_reused`. No new path is added.

## Exact formats

Migration (create it with `npm run migrate:create -- create-idempotency-keys`, then use exactly this SQL). It was tested on PostgreSQL 17.

```sql
CREATE TABLE idempotency_keys (
  client_id     uuid NOT NULL REFERENCES clients(id),
  key           text NOT NULL CHECK (key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request_hash  text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_code integer CHECK (response_code BETWEEN 200 AND 299),
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, key),
  CHECK ((response_code IS NULL) = (response_body IS NULL))
);

GRANT SELECT, INSERT ON idempotency_keys TO ledger_app;
GRANT UPDATE (response_code, response_body) ON idempotency_keys TO ledger_app;

-- Once a response is stored, it never changes.
CREATE FUNCTION idempotency_keys_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.response_code IS NOT NULL THEN
    RAISE EXCEPTION 'idempotency response is final'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER idempotency_keys_freeze
  BEFORE UPDATE ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION idempotency_keys_freeze();

-- A key that is committed always has a response.
CREATE FUNCTION idempotency_keys_require_response() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM idempotency_keys
     WHERE client_id = NEW.client_id AND key = NEW.key AND response_code IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'idempotency key committed without a response'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER idempotency_keys_require_response
  AFTER INSERT ON idempotency_keys
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION idempotency_keys_require_response();
```

Public interface:

```ts
// src/idempotency/with-idempotency.ts
export interface IdempotentResult { status: number; body: unknown } // status 200 to 299, body is JSON
export interface IdempotentOutcome extends IdempotentResult { replayed: boolean }
export function withIdempotency(options: {
  pool: Pool;
  client: AuthenticatedClient;
  key: string;   // already validated by parseIdempotencyKey
  hash: string;  // from requestHash
  run: (tx: PoolClient) => Promise<IdempotentResult>;
}): Promise<IdempotentOutcome>;

// src/idempotency/run-idempotent.ts  (what route handlers call)
export function runIdempotent(
  request: FastifyRequest, reply: FastifyReply, pool: Pool,
  run: (tx: PoolClient) => Promise<IdempotentResult>,
): Promise<FastifyReply>;

// src/idempotency/key.ts
export function parseIdempotencyKey(header: string | string[] | undefined): string; // throws ApiError(400, 'invalid_request', ...)

// src/idempotency/canonical-json.ts and request-hash.ts
export function canonicalJson(value: unknown): string;
export function requestHash(input: { method: string; url: string; body: unknown }): string;
```

Error responses:

| Case | Status | Code | Message |
| ---- | ------ | ---- | ------- |
| Key missing or empty | 400 | `invalid_request` | `Idempotency-Key header is required` |
| Key invalid | 400 | `invalid_request` | `Idempotency-Key header is not valid` |
| Same key, different request | 409 | `idempotency_key_reused` | `This Idempotency-Key was used for a different request` |
| Lock, deadlock, or transaction timeout | 503 | `busy` | `The service is busy. Retry with the same Idempotency-Key.` (header `Retry-After: 1`) |

Hash test vectors:

| Input | Expected |
| ----- | -------- |
| `canonicalJson({ b: 1, a: 2 })` | `{"a":2,"b":1}` |
| `canonicalJson({ a: { d: 1, c: 2 } })` | `{"a":{"c":2,"d":1}}` |
| `canonicalJson([2, 1])` | `[2,1]` |
| `canonicalJson({ B: 1, a: 2 })` | `{"B":1,"a":2}` |
| `canonicalJson(null)` | `null` |
| `requestHash({ method: 'POST', url: '/v1/test-only/idempotent', body: { b: 1, a: 2 } })` | `7e7c6a3dd98c1c382554874f44617205a5e9b09cfb4a738109b099941358f689` |
| `requestHash({ method: 'POST', url: '/v1/test-only/idempotent', body: null })` | `20f8eb578d0c0433f780e9ce32b4f83aa31c528b3e463aef7bda930165736d61` |

## Files
- Create: `migrations/<timestamp>_create-idempotency-keys.sql`
- Create: `src/idempotency/canonical-json.ts`, `request-hash.ts`, `key.ts`, `with-idempotency.ts`, `run-idempotent.ts`
- Create: `src/http/db-errors.ts`
- Change: `src/http/errors.ts` (use `mapDbError`, add `Retry-After` for 503)
- Change: `openapi/ledger.v1.yaml` (components only)
- Create: `test/idempotency-canonical.test.ts`, `test/idempotency-key.test.ts`, `test/idempotency-migration.test.ts`, `test/idempotency-wrapper.test.ts`, `test/db-errors.test.ts`
- Change: `docs/patterns.md` (add "Writing an idempotent endpoint", with a 10-line example), `docs/rfc-001.md` (one note: the table gets `transaction_id` in F4), `CHANGELOG.md`, this file

## Done when
- [x] All rules in docs/invariants.md still hold
- [x] The migration is exactly the SQL above, and the app role has only the stated privileges (tests R12, R18, R19)
- [x] The same request with the same key from the same client runs the handler once and replays the first status and body with `Idempotent-Replayed: true` (R1)
- [x] The same key with a different body or a different URL gives 409 `idempotency_key_reused` and changes nothing (R2, R3)
- [x] A missing or invalid key gives 400 and writes nothing, for every case in the table (R4)
- [x] 50 identical requests in parallel apply the effect exactly once, and all 50 replies have the same status and body (R5)
- [x] The same key used in parallel with two different bodies applies exactly one of them, and nothing returns a 5xx (R6)
- [x] A failed request (422, a thrown error, or a failure after the effect) leaves no key and no effect, and a retry with the same key can succeed (R7, R8, R9)
- [x] Keys are scoped to the client (R10)
- [x] Authentication happens first, and a revoked client cannot replay (R11)
- [x] A stored response cannot change or be deleted, and a key cannot commit without a response (R12)
- [x] Canonical JSON and the request hash pass every vector above and the edge cases (R13)
- [x] A lock timeout gives 503 `busy` with `Retry-After`, and unknown database errors give a generic 500 (R14, R15)
- [x] No connection leaks after 100 requests that include every kind of failure (R20)
- [x] The OpenAPI file documents the contract and `npm run openapi:lint` passes (R17)
- [ ] `npm run lint`, `format:check`, `typecheck`, `openapi:lint`, `test`, and `build` pass. CI is green

## Test plan
| Rule | Test name | Sabotage that must make it fail |
| ---- | --------- | ------------------------------- |
| R1 replay | `replays the first response and runs the handler once` | Always run the handler, even when the key exists |
| R2 different body | `refuses the same key with a different body` | Remove the hash comparison |
| R3 different URL | `refuses the same key on a different URL` | Leave the URL out of the hash |
| R4 key format | `rejects a missing or invalid Idempotency-Key` (one case per row: missing, empty, 7 chars, 129 chars, bad character, two headers) | Loosen the regex to `{1,128}` |
| R5 parallel same | `applies 50 parallel identical requests exactly once` using the normal pool size of 10, without any `timeout exceeded when trying to connect` error | Drop `ON CONFLICT`, commit the key before running the handler, or enlarge the pool for the test |
| R6 parallel different | `lets exactly one body win when the same key is used with different bodies` using the normal pool size of 10, without any `timeout exceeded when trying to connect` error | Remove the hash comparison or enlarge the pool for the test |
| R7 failure leaves no key | `does not store a failed request` | Commit the key row before the handler runs |
| R8 unexpected error | `rolls back on an unexpected error` | Catch the error and commit |
| R9 atomic with effect | `commits the effect and the key together or not at all` | Run the handler's SQL on a different connection |
| R10 client scope | `scopes keys to the client` | Look up by `key` only, without `client_id` |
| R11 auth first | `authenticates before touching idempotency` | Make the hook skip this route |
| R12 final response | `protects stored responses` | Remove the freeze trigger |
| R12 no response | `refuses to commit a key without a response` (as the owner role) | Remove the deferred trigger |
| R13 canonical | `canonical JSON: <each vector and edge case>` | Stop sorting keys |
| R14 busy | `answers 503 busy when the key row is locked too long` | Remove the `55P03` mapping |
| R15 hidden errors | `hides unknown database errors` | Return `error.message` in the body |
| R16 same JSON value | `replays the same JSON value` (nested objects, arrays, strings with unicode) | Store the body in the wrong column |
| R17 contract | `documents the idempotency contract` | Delete the `IdempotentReplayed` header from the spec |
| R18 privileges | `grants only the needed privileges` | `GRANT ALL` in the migration |
| R19 checks | `enforces key and status formats in the database` | Loosen a `CHECK` |
| R20 no leaks | `never leaks a connection` (idle plus used connections return to the starting count after 100 mixed requests) | Remove `release()` in one path |
| Connection ownership | `uses a single connection per request` (while one request is inside `run`, `pool.totalCount - pool.idleCount` increases by exactly 1) | Run the effect through a different connection or acquire more than one connection |
| Misuse | `refuses a non-POST request or a missing client` | Remove the guard |

## Edge cases that must be tested
- Key length 7, 8, 128, and 129. Characters `. _ : -` allowed. A space, `/`, and a non-ASCII letter refused.
- Body `{}`, no body, and `null` are three cases: show which are equal and which differ (`null` and no body hash the same by decision 3).
- Same key, same body, different query string: 409.
- Two clients, same key, at the same moment: both succeed.
- The first request fails with a lock timeout while the second waits: the second does not hang forever (it sees the lock timeout too, then 503).
- The R5 and R6 parallel tests use the normal pool size of 10; they must not enlarge the pool and must not produce `timeout exceeded when trying to connect`.
- The test-only route runs all SQL through `tx`.
- `uses a single connection per request`: while one request is inside `run`, `pool.totalCount - pool.idleCount` increases by exactly 1.
- A replay after the client's scope changed to read-only: 403 (authorization still applies).
- `runIdempotent` with a `GET` request or no client: throws, and `run` is not called.
- 100 sequential requests alternating success and failure: the pool returns to its starting size.

## Fail-closed checklist
- A request with no valid key never reaches the wrapper (the hook runs first). Test: unauthenticated request with a valid `Idempotency-Key` gives 401 and zero rows in `idempotency_keys`.
- A bad or missing `Idempotency-Key` is refused (the default is refuse).
- A database error that is not on the list is a 500, not a pass-through.
- The `no_response` case is impossible to commit (deferred trigger).

## Complex parts (extra oversight)
The planner writes the algorithm. The executor follows it exactly. The planner reviews the diff of `src/idempotency/`, the migration, `src/http/db-errors.ts`, `src/http/errors.ts`, and the concurrency tests (prompt 8).

`withIdempotency` steps:
1. `tx = await pool.connect()`. Everything after this is in `try { ... } finally { release }`.
2. `await tx.query('BEGIN')`.
3. Claim the key: `INSERT INTO idempotency_keys (client_id, key, request_hash) VALUES ($1, $2, $3) ON CONFLICT (client_id, key) DO NOTHING RETURNING 1`.
4. **If a row came back** (we own the key):
   - `const result = await run(tx)`. Check `result.status` is an integer from 200 to 299, else throw a programming `Error`.
   - `UPDATE idempotency_keys SET response_code = $3, response_body = $4::jsonb WHERE client_id = $1 AND key = $2` with `JSON.stringify(result.body)`.
   - `COMMIT`. Return `{ ...result, replayed: false }`.
5. **If no row came back** (an earlier request committed this key; a concurrent uncommitted one made step 3 wait until it finished):
   - `SELECT request_hash, response_code, response_body FROM idempotency_keys WHERE client_id = $1 AND key = $2`.
   - If there is no row (it cannot happen), throw a programming `Error`.
   - If `request_hash` differs: `ROLLBACK`, throw `ApiError(409, 'idempotency_key_reused', ...)`.
   - If `response_code` is null (it cannot happen after a commit): throw a programming `Error`, so it becomes a loud 500.
   - Otherwise `ROLLBACK` (nothing to commit), return `{ status: response_code, body: response_body, replayed: true }`.
6. **On any error** in steps 3 to 5: `ROLLBACK` (ignore a rollback failure, but release the client with `release(true)`), then rethrow the original error.

Why this is safe under concurrency (the executor must keep this reasoning in a code comment):
- The primary key is the lock. Two requests with the same key cannot both own it. The second waits at step 3 until the first commits or rolls back.
- If the first commits, the second sees the committed row and replays. If the first rolls back, the second inserts its own row and proceeds.
- The stored response is written in the **same transaction** as the effect, so a committed key always has an effect and a response (and the deferred trigger proves it).
- The wait in step 3 is a lock wait. It is limited by the role's `lock_timeout` (5 s), which becomes a 503 `busy`.

`mapDbError(error)` returns an `ApiError` for `55P03`, `40P01`, and `25P04`, and `undefined` for anything else. The error handler adds `Retry-After: 1` when the status is 503.

## Docs to update
- `docs/patterns.md`: "Writing an idempotent endpoint".
- `docs/rfc-001.md`: one note under the `idempotency_keys` table.
- `openapi/ledger.v1.yaml`: components only.
- `CHANGELOG.md`.
- `docs/roadmap.md` is edited by the owner, not the executor.

## Metrics
- Questions the executor asked: none
- Fix-now findings in review pass 1: 2 weak assertions (R5 and R10); hardened, plus the requested follow-up fixes
- Fix-now findings in review pass 2: not run
- Rough minutes: spec check 10 / tests first 20 / build 5 / review fixes 90
- `npm test` duration: 86.68 seconds; 18 test files; 169 tests passed

## Review log
- Pass 1: findings, fixed, moved to backlog
- Pass 2 (only if pass 1 had fix-now items): findings, fixed, moved to backlog
