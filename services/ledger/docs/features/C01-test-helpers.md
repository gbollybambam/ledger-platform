# Feature: C1 Shared test helpers (a chore, before F2)
Status: done

## Goal
Put the fixture, app, log-capture, and error-check code that F1 repeated in many test files into shared helpers, and make the operator-tool tests run in-process. After this, a new feature's tests are shorter, safer, and faster. **No production behavior changes.**

## Out of scope
- Any change under `src/` or `migrations/`.
- Any new feature or any new rule.
- Changing `vitest.config.ts` (no `isolate: false`).
- Deleting or weakening any assertion.

## Reads first
1. `docs/patterns.md` (section 7, Tests)
2. `docs/process/lessons-from-f1.md` (repository root: `docs/process/lessons-from-f1.md`)
3. The existing files in `test/` and `test/helpers/`

## Decisions already made (do not ask)
1. New files: `test/helpers/clients.ts`, `test/helpers/app.ts`, `test/helpers/logs.ts`, `test/helpers/http.ts`. The existing `test/helpers/db.ts` stays and may gain a shared migrator connection.
2. `createTestClient(options?: { scopes?: Scope[]; name?: string })` returns `{ id, name, key, scopes, authorization, revoke(), remove() }`. `authorization` is `Bearer <key>`. The default scopes are `['ledger:read']`. The default name is `t-` plus 8 random hex characters. The key comes from `generateApiKey()`, the hash from `hashApiKey()`. The row is inserted with the migrator connection.
3. `withTestClient(options, fn)` creates a client, runs `fn(client)`, and always removes the client in `finally`, even when `fn` throws.
4. `buildTestApp(options?: { routes?: (app: FastifyInstance) => void; logs?: boolean })` returns `{ app, pool, logs(), close() }`. `routes` runs **before** `app.ready()`. When `logs` is true the logger writes JSON lines into memory. The pool connects as the app role. `close()` closes the app and the pool.
5. `captureLogs()` returns `{ stream, text(), lines() }`. `lines()` parses each JSON line and fails the test on a line that is not valid JSON.
6. `expectErrorBody(response, { status, code, message? })` checks the content type is JSON, the body is **exactly** `{ error: { code, message, request_id } }`, and `request_id` equals the `x-request-id` header.
7. `expectIdentical401(responses)` checks that every response has status 401, the same headers that matter (`content-type`, `www-authenticate`), and the same body except `request_id`. It also checks the request IDs are all different.
8. All fixture IDs and names are random per call. No fixed IDs remain in any test file.
9. Every existing test file that created clients, apps, or log streams is changed to use the helpers. Assertions stay the same or become stronger. **No test is deleted.** The test count must be greater than or equal to the count before.
10. `test/client-admin.test.ts`: every logic case calls `runClientAdmin()` in-process with captured writers, and keeps its exact-output assertions. Keep **exactly two** real-process smoke tests: one happy path (create, list, revoke, with exit codes) and one connection error (the password never appears). Real-process tests run `npm run --silent <script>`.
11. `.env.example`: replace `localhost` with `127.0.0.1` in all six URLs.
12. The helpers close every connection they open. Provide `closeTestDb()` and call it in `afterAll` in every file that uses the shared migrator connection.

## Exact formats
```ts
// test/helpers/clients.ts
export interface TestClient {
  id: string;
  name: string;
  key: string;
  scopes: Scope[];
  authorization: string; // `Bearer ${key}`
  revoke(): Promise<void>;
  remove(): Promise<void>;
}
export function createTestClient(options?: { scopes?: Scope[]; name?: string }): Promise<TestClient>;
export function withTestClient<T>(options: { scopes?: Scope[]; name?: string }, fn: (client: TestClient) => Promise<T>): Promise<T>;
export function closeTestDb(): Promise<void>;
```

## Files
- Create: `test/helpers/clients.ts`, `test/helpers/app.ts`, `test/helpers/logs.ts`, `test/helpers/http.ts`, `test/helpers.test.ts`
- Change: `test/helpers/db.ts`, `test/clients-auth.test.ts`, `test/clients-migration.test.ts`, `test/errors.test.ts`, `test/client-admin.test.ts`, `test/health.test.ts`, `test/openapi.test.ts` (only if it benefits), `.env.example`
- Change: `docs/features/C01-test-helpers.md` (this file: tick boxes and fill Metrics)

## Done when
- [x] All rules in docs/invariants.md still hold
- [x] The helpers exist with the exact signatures above (test: `helpers.test.ts`)
- [x] 50 parallel `createTestClient()` calls give 50 different ids, names, and keys, and `remove()` deletes each row (test: `creates unique clients in parallel`)
- [x] `withTestClient` removes the client even when the callback throws (test: `cleans up when the callback throws`)
- [x] `expectErrorBody` and `expectIdentical401` fail when the body shape or a header is wrong (test: `rejects a wrong error shape`)
- [x] No test file contains a fixed client UUID or a hand-written `INSERT INTO clients`
- [x] The total test count is not lower than before, and no assertion is weaker (`git diff main...HEAD -- test` reviewed)
- [x] `client-admin` logic tests run in-process. Exactly two real-process tests remain, both with `npm run --silent`
- [x] Running the whole suite twice in a row passes both times, and a third run with one test forced to fail leaves no leftover rows in `clients`
- [x] The suite is faster. Report the time before and after in Metrics

## Test plan
| Rule | Test name | Sabotage that must make it fail |
| ---- | --------- | ------------------------------- |
| Unique clients | `creates unique clients in parallel` | Use a fixed name or a short random value (such as 1 digit) |
| Cleanup on throw | `cleans up when the callback throws` | Remove the `finally` in `withTestClient` |
| Remove deletes the row | `remove deletes the client row` | Make `remove()` a no-op |
| Helpers catch bad shapes | `rejects a wrong error shape` | Make `expectErrorBody` check only the status |
| No leftover rows | `leaves no test clients behind` | Skip cleanup in one helper |
| Identical 401 check is real | `rejects 401 responses that differ` | Compare only the status code |

## Edge cases that must be tested
- `createTestClient` with two scopes, one scope, and a custom name.
- `revoke()` then calling the API with the key gives 401.
- A failing assertion inside `withTestClient` still removes the client.
- `buildTestApp` with and without `logs`, and with extra routes.
- `captureLogs().lines()` throws on a line that is not JSON.

## Fail-closed checklist
Not applicable. No production code changes.

## Complex parts (extra oversight)
None. The planner does not review this feature. The owner checks the Metrics numbers and `git diff main...HEAD -- test`.

## Docs to update
- This file (boxes and Metrics).
- `CHANGELOG.md`: one line.

## Metrics
- Questions the executor asked: 0
- Fix-now findings in review pass 1: 0
- Suite time before / after (seconds): 125.33 / 41.44
- Rough minutes: spec check / tests first / build / review fixes: not recorded

## Review log
- Pass 1: self-review found no checklist violations; no fixes or backlog items.
- Pass 2: review found duplicated HTTP assertions in `clients-auth.test.ts` and `errors.test.ts`; replaced them with shared helpers and fixed the helper header type.
