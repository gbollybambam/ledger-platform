# Feature: F3 Currencies and accounts
Status: done

## Goal
A client can read the allowed currencies, create accounts (safe to retry), and find them. Accounts start empty, never change, and are never deleted. All input is strict.

## Out of scope
Transactions, entries, balances, totals (F4). `PATCH` or delete. Listing all accounts (F8). Contra accounts. Per-client isolation. Any change to RFC, invariants, or decisions (the planner already did it).

## Reads first
`docs/invariants.md` (INV-04, 07, 11, 12, 14, 16, 17, 18) · decisions 0015, 0016, 0020, 0021 · RFC sections "Data model", "Database protections", "Accounts and currencies", "Input validation" · `docs/patterns.md` · `src/idempotency/run-idempotent.ts` and `src/http/errors.ts`.

## Decisions already made (do not ask)
1. Two migrations, in this order, with the exact SQL below (tested on PostgreSQL 17): `create-currencies`, then `create-accounts`. Create them with `npm run migrate:create -- <name>`.
2. Folders: `src/accounts/{routes,service,sql,schemas}.ts`, `src/currencies/routes.ts`, `src/http/validation.ts`.
3. `src/app.ts` creates Fastify with `bodyLimit: 65_536`, `ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false, allErrors: false } }`, and `schemaErrorFormatter` from `validation.ts`.
4. Messages are fixed text (table below). Never forward `error.message`. Never use Ajv's `additionalProperty` value.
5. Account representation: exactly the 9 fields below. No totals. `external_id` is `null` when absent. `created_at` is `toISOString()`.
6. Normal balance map in code: asset, expense → `debit`; liability, equity, revenue → `credit`. The service sets it. The CHECK is the backstop.
7. `POST /v1/accounts`: access `ledger:write`, runs inside `runIdempotent`, returns 201. IDs come from `randomUUID()` inside `run`. `client_id` is the caller's.
8. Inside `run(tx)`: `allow_negative` true with kind other than equity → `ApiError(422, 'invalid_account', 'Only equity accounts may allow negative balances')`. A pg error `23505` with constraint `accounts_client_id_external_id_key` → `ApiError(409, 'external_id_conflict', 'An account with this external_id already exists')`. `23503` with constraint `accounts_currency_fkey` → `ApiError(422, 'unknown_currency', 'Currency is not supported')`. Any other error is rethrown.
9. `GET /v1/accounts/{id}`: access `ledger:read`. `id` pattern is a UUID (upper or lower case). Not found: `ApiError(404, 'not_found', 'Account not found')`. Any client may read any account.
10. `GET /v1/accounts?external_id=&client=`: access `ledger:read`. `external_id` is required. `client` is optional, pattern `^[a-z][a-z0-9-]{1,39}$`, and defaults to the caller's own name. Returns `{ "data": [] }` or one account. An unknown client name also gives `{ "data": [] }`.
11. `GET /v1/currencies`: access `ledger:read`. Returns `{ "data": [{ "code", "minor_exponent" }] }` sorted by code.
12. Reads use `pool.query`. Writes use `tx` only.
13. Patterns. `name`: regex `^[^\p{Cc}\s](?:[^\p{Cc}]*[^\p{Cc}\s])?$` with `minLength` 1 and `maxLength` 120. In a TypeScript string write it as `'^[^\\p{Cc}\\s](?:[^\\p{Cc}]*[^\\p{Cc}\\s])?$'`. `external_id`: `^[A-Za-z0-9._:-]{1,128}$`. `currency`: `^[A-Z]{3}$`. `kind`: enum of the five kinds. (Planner-tested in Fastify: 120 emoji pass, 121 fail; a leading or trailing space, a tab, a newline, and a trailing NBSP fail.)
14. `validation.ts` exports `KNOWN_FIELDS` (`name, kind, currency, allow_negative, external_id, client, id`) and `formatSchemaError` (algorithm below).
15. `errors.ts`: for 4xx errors that are not `ApiError`, send fixed text by status (table below).
16. OpenAPI: add operations `createAccount`, `getAccount`, `findAccounts`, `listCurrencies`; schemas `Account`, `CreateAccountRequest`, `AccountList`, `Currency`, `CurrencyList`; responses for 400, 401, 403, 404, 409, 413, 415, 422, 503 where they can happen. `POST` uses the `IdempotencyKey` parameter and documents the `Idempotent-Replayed` header on 201.
17. Do not edit the RFC, invariants, decisions, roadmap, or `AGENTS.md`.

## Exact formats

Migration 1, `create-currencies`:

```sql
CREATE TABLE currencies (
  code           char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  minor_exponent smallint NOT NULL CHECK (minor_exponent BETWEEN 0 AND 4)
);

INSERT INTO currencies (code, minor_exponent) VALUES
  ('EUR', 2),
  ('GBP', 2),
  ('GHS', 2),
  ('KES', 2),
  ('NGN', 2),
  ('USD', 2),
  ('ZAR', 2);

GRANT SELECT ON currencies TO ledger_app;
```

Migration 2, `create-accounts`:

```sql
CREATE TABLE accounts (
  id             uuid PRIMARY KEY,
  client_id      uuid NOT NULL REFERENCES clients(id),
  name           text NOT NULL
                   CHECK (name = btrim(name)
                          AND char_length(name) BETWEEN 1 AND 120
                          AND name !~ '[[:cntrl:]]'),
  kind           text NOT NULL CHECK (kind IN
                   ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  currency       char(3) NOT NULL REFERENCES currencies(code),
  allow_negative boolean NOT NULL DEFAULT false,
  external_id    text CHECK (external_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  debits_total   bigint NOT NULL DEFAULT 0 CHECK (debits_total >= 0),
  credits_total  bigint NOT NULL DEFAULT 0 CHECK (credits_total >= 0),
  version        bigint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, currency),
  UNIQUE (client_id, external_id),
  CONSTRAINT normal_balance_follows_kind CHECK (
    normal_balance = CASE kind
      WHEN 'asset'   THEN 'debit'
      WHEN 'expense' THEN 'debit'
      ELSE                'credit'
    END),
  CONSTRAINT negative_only_for_equity CHECK (NOT allow_negative OR kind = 'equity'),
  CONSTRAINT no_overdraft CHECK (
    allow_negative OR
    (CASE normal_balance
       WHEN 'debit'  THEN debits_total - credits_total
       ELSE               credits_total - debits_total
     END) >= 0)
);

-- The app may create an account, but never set its totals, version, or time.
GRANT SELECT ON accounts TO ledger_app;
GRANT INSERT (id, client_id, name, kind, normal_balance, currency, allow_negative, external_id)
  ON accounts TO ledger_app;
GRANT UPDATE (debits_total, credits_total, version) ON accounts TO ledger_app;

-- An account's identity never changes. Only totals and version may change.
CREATE FUNCTION accounts_identity_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id             IS DISTINCT FROM OLD.id
  OR NEW.client_id      IS DISTINCT FROM OLD.client_id
  OR NEW.name           IS DISTINCT FROM OLD.name
  OR NEW.kind           IS DISTINCT FROM OLD.kind
  OR NEW.normal_balance IS DISTINCT FROM OLD.normal_balance
  OR NEW.currency       IS DISTINCT FROM OLD.currency
  OR NEW.allow_negative IS DISTINCT FROM OLD.allow_negative
  OR NEW.external_id    IS DISTINCT FROM OLD.external_id
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'account identity is final'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER accounts_identity_is_final
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_identity_is_final();

-- Accounts are never deleted.
CREATE FUNCTION accounts_are_never_deleted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'accounts are never deleted'
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;

CREATE TRIGGER accounts_are_never_deleted
  BEFORE DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_are_never_deleted();
```

Create body (strict, no other fields; `normal_balance` is refused):

```json
{ "name": "Wallet: Ada", "kind": "liability", "currency": "NGN", "allow_negative": false, "external_id": "user:123" }
```

Account (201 and 200):

```json
{ "id": "…", "client_id": "…", "name": "Wallet: Ada", "kind": "liability", "normal_balance": "credit",
  "currency": "NGN", "allow_negative": false, "external_id": "user:123", "created_at": "2026-11-04T10:00:00.000Z" }
```

Fixed messages:

| Case | Status | Code | Message |
| ---- | ------ | ---- | ------- |
| Schema failure | 400 | `invalid_request` | `Request is not valid` or `Request is not valid: <field>` |
| Malformed JSON, empty JSON body, `__proto__` or `constructor` key | 400 | `invalid_request` | `Request is not valid` |
| Body over 65536 bytes | 413 | `payload_too_large` | `Request body is too large` |
| No content type with a body, or an unknown one (for example `application/xml`) | 415 | `unsupported_media_type` | `Unsupported content type` |
| Other 4xx from the framework | same status | `client_error` | `Request could not be processed` |

`formatSchemaError(errors)`: take `errors[0]`. If its keyword is `required`, the field is `params.missingProperty`. Otherwise it is the last segment of `instancePath`. If the field is in `KNOWN_FIELDS`, the message is `Request is not valid: <field>`. Otherwise it is `Request is not valid`. Return an `ApiError(400, 'invalid_request', message)`. (For an extra property, `instancePath` is empty, so no field is shown: the property name is the client's text.)

Observed framework behavior (planner tested): `text/plain` with a body fails schema validation (400, not 415). Query values stay strings. Two `external_id` values give 400. Upper-case UUIDs are accepted.

## Files
Create: two migrations, `src/accounts/*`, `src/currencies/routes.ts`, `src/http/validation.ts`, `test/currencies-db.test.ts`, `test/accounts-db.test.ts`, `test/accounts-api.test.ts`, `test/accounts-validation.test.ts`, `test/accounts-concurrency.test.ts`.
Change: `src/app.ts`, `src/http/errors.ts`, `openapi/ledger.v1.yaml`, `docs/patterns.md` (add "Writing a validated endpoint", about 15 lines), `CHANGELOG.md`, this file.

## Done when
- [x] All rules in docs/invariants.md still hold
- [x] Currencies and accounts tables behave exactly as the SQL says, proven by attempting each forbidden change as the right role (D1 to D12)
- [x] Every kind gets the right normal balance, and clients cannot set it (A1, A3)
- [x] Input is strict: wrong types, extra fields, bad bodies, bad content types, and oversize bodies are refused with the fixed messages, and no client text is ever echoed (A2, A3, A4, V1 to V5)
- [x] Unknown currency gives 422, allow_negative outside equity gives 422, a duplicate external_id gives 409 (A5, A6, A7)
- [x] Creating is idempotent and attributed to the caller (A8, A13)
- [x] Scopes are exact, and lookups default to the caller's own accounts (A9, A10)
- [x] The OpenAPI file documents all four operations (O1)
- [x] Lint, format, typecheck, openapi:lint, tests, and build pass locally. CI is pending

## Test plan
S = sabotage required. D rows are **behavioral database tests**: attempt the forbidden statement and assert the exact SQLSTATE and constraint name. Never read the SQL file. No sabotage needed for D rows.

| Row | Rule | Test name | S | Sabotage |
| --- | ---- | --------- | - | -------- |
| D1 | Seven currencies, exact codes and exponents | `seeds exactly the seven currencies` | | |
| D2 | App role: SELECT only on currencies | `currencies are read-only for the app` | | |
| D3 | Normal balance follows kind: 5 right pairs pass, 5 wrong pairs fail `normal_balance_follows_kind` | `normal balance follows the kind` | | |
| D4 | `allow_negative` only for equity (`negative_only_for_equity`) | `only equity may allow negative` | | |
| D5 | Identity final: app `UPDATE name` 42501; owner update of each of 8 columns 23000; `version` update allowed | `account identity is final` | | |
| D6 | Never deleted: app 42501, owner 23000 | `accounts are never deleted` | | |
| D7 | App cannot set `debits_total`, `credits_total`, `version`, `created_at` on insert (42501 each) | `an account cannot start with a balance` | | |
| D8 | Name (empty, 121, leading space, trailing space, tab, ok) and `external_id` (128 ok, 129, space, `/`, `é`) CHECKs | `field checks hold in the database` | | |
| D9 | Unique `(client_id, external_id)` 23505; other client same id ok; two NULLs ok | `external_id is unique per client` | | |
| D10 | Unknown currency 23503 `accounts_currency_fkey` | `currency must be on the allow-list` | | |
| D11 | `no_overdraft` CHECK: owner sets a debit on a new liability 23514; same on equity with allow_negative ok | `no_overdraft holds on accounts` | | |
| A1 | Each kind: 201, derived `normal_balance`, row matches | `derives the normal balance for each kind` | S | Map asset to `credit` |
| A2 | Wrong types are refused, never converted (name number, allow_negative string, kind number) | `refuses wrong types` | S | Set `coerceTypes: true` |
| A3 | Extra fields refused (`normal_balance`, `id`, unknown) | `refuses unknown fields` | S | Remove `additionalProperties: false` |
| A4 | Canary strings (as a value, as an unknown key, in malformed JSON) never appear in any error body or log; message is exactly the fixed text | `never echoes client text` | S | Use `error.message` or `additionalProperty` in the message |
| A5 | Well-formed unknown currency (`XXX`) 422 `unknown_currency`; no row | `refuses an unknown currency` | S | Remove the 23503 mapping |
| A6 | `allow_negative` on non-equity 422 `invalid_account`; on equity 201 | `refuses negative balances outside equity` | S | Remove the pre-check |
| A7 | Same `external_id`, new key: 409, no second row; other client same id: 201 | `refuses a duplicate external_id` | S | Remove the 23505 mapping |
| A8 | Same key and body: replay (same id, header); same key, other body: 409; one row | `creating is idempotent` | S | Insert outside `runIdempotent` |
| A9 | Read-only client POST 403; write-only client GET (all 3 GETs) 403 | `scopes are exact` | S | Declare `ledger:read` on POST |
| A10 | Lookup defaults to the caller; `client=other` finds the other; unknown client gives empty | `lookup is scoped to the caller by default` | S | Search all clients |
| A11 | 65,537-byte body 413 with a key; without a key 401 | `limits the body size` | S | Raise `bodyLimit` |
| A12 | `client_id` equals the caller | `records the creating client` | S | Hardcode another client |
| A13 | Exact 9-field shape, no totals, `external_id` null | `returns the exact account shape` | | |
| A14 | GET by id: 200 equals the create response; upper-case id returns lower-case; 404 unknown; 400 malformed | `reads an account by id` | | |
| A15 | Currencies endpoint: exact sorted list | `lists the currencies` | | |
| V1 | Missing field (each of 3), empty body, no body, array, null | `refuses incomplete bodies` | | |
| V2 | Boundaries: name 1, 120, 121, 120 and 121 emoji, spaces, tab, newline, NBSP; external_id 1, 128, 129, bad characters; currency lower, 2, 4 letters; kind invalid | `field boundaries` | | |
| V3 | Malformed JSON, empty JSON body, `__proto__`, `constructor` give 400 fixed message | `refuses malformed JSON` | | |
| V4 | `text/plain` 400; `application/xml` 415; no content type 415; JSON with charset 201 | `content types` | | |
| V5 | Query: missing, duplicated, extra, bad character, bad `client` pattern give 400 | `refuses bad queries` | | |
| V6 | Every property in the schemas is in `KNOWN_FIELDS` | `KNOWN_FIELDS matches the schemas` | | |
| C1 | 50 identical creates in parallel (one key) give one row; 20 different keys, same `external_id` give one 201 and nineteen 409, no 5xx; 20 different ids give 20 rows; normal pool | `accounts concurrency` | S | Drop the 23505 mapping (race becomes a 500) |
| O1 | Spec has the 4 operations, `IdempotencyKey` on POST, replay header on 201, schemas, 409 and 422 responses (parse the YAML) | `documents accounts and currencies` | | |

## Edge cases that must be tested
Everything in V1 to V5 and C1, plus: two clients with the same `external_id` each find their own; replay returns the original id and `created_at`; a 409 for a duplicate is not stored (a retry with the same key re-runs); an unauthenticated 65,537-byte body gives 401; the all-routes test covers the four new routes without a new test.

## Fail-closed checklist
New routes declare access (and the all-routes test proves it). Schemas refuse by default. Unknown currency, extra field, wrong type, and unknown content type are refused. The database refuses what the code forgets.

## Complex parts
1. **Migrations** are written and tested by the planner. Use them as given.
2. **Strict validation:** the traps are in the decisions above (defaults convert types, Ajv echoes extra property names, framework messages must not be forwarded).
3. **The duplicate race:** two creates with the same `external_id` but different keys both reach `INSERT`. The second waits on the unique index until the first commits, then fails with `23505`, which becomes 409. A wait longer than `lock_timeout` becomes 503 `busy` through the existing mapping. Write this reasoning in a code comment.

Create algorithm (inside `run(tx)`): check `allow_negative` vs kind, then `id = randomUUID()`, `normal_balance = map[kind]`, then one `INSERT … RETURNING` of the 8 allowed columns plus `created_at`, map the two pg errors, return `{ status: 201, body: account }`.

Planner review: yes (src and migrations diff, test names, S table).

## Docs to update
`docs/patterns.md`, `CHANGELOG.md`, `openapi/ledger.v1.yaml`, this file.

## Metrics (write the AIC counter after each step)
| Step | AIC used |
| ---- | -------- |
| Prompt 1 | not tracked |
| Prompt 2 (tests) | not tracked |
| Prompt 3 (build + prove) | not tracked |
| Review fixes | not tracked |
| Done check | not tracked |
| Total | not tracked |

Questions asked: 0 | Fix-now findings: 1 | Minutes in total: not tracked

## Review log
- Self-review: complete. All S rows were sabotaged to red and restored; full checks passed.
- Independent planner review: not run in this CLI session.
- Pass 2 (only if there were fix-now items): framework error fallback now returns the fixed internal error body instead of exposing `error.message`.
