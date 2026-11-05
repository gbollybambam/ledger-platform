# Patterns (ledger)

How code in this service is written. These came from F1 and its review. Follow them. If a pattern is wrong, say so. Do not work around it.

## 1. Folders

- `src/auth/`: keys, authentication, access rules.
- `src/http/`: routes that are not a feature, error handling, health.
- `src/db/`: pool, timeouts, database error mapping.
- `src/<feature>/`: one folder per feature (for example `src/accounts/`) with `routes.ts` (HTTP), `service.ts` (rules), `sql.ts` (queries).
- `scripts/`: operator tools. `scripts/lib/` holds the logic, so tests can call it.
- `test/`: one test file per feature or concern. `test/helpers/` holds shared test code.

## 2. Declaring a route

Every route declares its access. A route without it stops the app from starting.

```ts
app.get('/v1/accounts/:id', { config: { access: 'ledger:read' } }, handler);
```

- Allowed values: `'any-client'`, `'ledger:read'`, `'ledger:write'`. (`'public'` is only for the two health paths.)
- Never check a scope inside a handler.
- Never match paths by prefix. The route declares its own access.
- The hook authenticates **everything** that is not an exact public health request, including unknown paths.

## 3. Errors

- Throw `new ApiError(status, code, message)`. Do not build error bodies by hand. Everything goes through `errorBody()`.
- Messages are generic. They never contain input values, SQL, file paths, or stack traces.
- Map known database errors in one place (`src/http/db-errors.ts`). Do not catch database errors in handlers to hide them.
- A 401 always has the same body and `WWW-Authenticate: Bearer`.

## 4. Request validation (DEC-0021)

- Every route that takes a body, query, or params has a JSON schema with `additionalProperties: false`. Shared options and the error formatter live in `src/http/validation.ts`.
- Fastify is created with `ajv.customOptions` `{ coerceTypes: false, removeAdditional: false, useDefaults: false, allErrors: false }` and `bodyLimit: 65536`. Its defaults convert types and drop fields silently.
- Error messages are fixed text. Never forward `error.message` from Fastify or Ajv. Never use Ajv's `additionalProperty` value: it is the client's text.
- A validation error is 400 `invalid_request`: `Request is not valid`, or `Request is not valid: <field>` for a field named in our own schemas.
- Unmatched `text/plain` bodies fail validation (400). A missing or unknown content type is 415. A body over the limit is 413.

## 5. Money and SQL

- Money is `bigint` in code and an integer string in the API. Never `number`.
- `pg` returns `bigint` columns as strings. Keep them as strings or `BigInt`.
- Every query is parameterized.
- Writes follow the posting steps in `docs/rfc-001.md`.

## 6. Migrations

- One idea per file. Plain SQL. No `Down`. Create with `npm run migrate:create -- <name>`.
- Explicit `GRANT`s, only what the app role needs. Column-level `UPDATE` where possible.
- A test proves the privileges: what the app role can do, and what it cannot.
- A rule that protects money is also a constraint or trigger.

## 7. Tests

- File name `test/<feature>.test.ts`. Test names say the rule they prove.
- Every rule has a positive and a negative test. Every limit is tested on both sides and past the limit.
- Unique fixtures per test (`randomUUID()` in names and IDs). Clean up in `try/finally`. Clean up at the start too.
- No test depends on another test, on order, or on a fixed ID.
- Assert exact bodies, status codes, and headers.
- Use the helpers in `test/helpers/` (see `docs/features/C01-test-helpers.md`). Do not copy fixture code between files.
- Logic tests run in-process. Start a real process only for one or two smoke tests, and run scripts with `npm run --silent`.
- **Sabotage check:** for each test-plan row marked **S**, break the production code on purpose and show that the test fails. Then restore it.
- A test that loops over all routes keeps future routes covered.

## 8. OpenAPI

- Change `openapi/ledger.v1.yaml` in the same commit as the code.
- Document every response: 200 or 201, 400, 401, 403, 404, 409, 422, 503 where they can happen.
- Reuse `components`. Money fields use the `Amount` schema.
- `operationId` is `verbNoun`, for example `createAccount`.

## 9. Commits

- Tests first, in their own commit. Then one commit per rule or step.
- Read `git diff` before every commit. No stray paths, no debug code.
