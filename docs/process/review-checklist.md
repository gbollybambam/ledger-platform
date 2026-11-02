# Self-review checklist

The executor runs this against its own diff **before** asking for review (prompt 10). A reviewer can use it too. Each item is a class of mistake that has really happened.

## Security defaults

- [ ] Every new control is **default deny**. The allowed cases are a short, declared list.
- [ ] Every new route declares its `access`. No scope check is hidden inside a handler.
- [ ] A test loops over **all** registered routes, so a future route is covered without a new test.
- [ ] Unknown, malformed, or odd requests (bad URL, huge body, wrong content type) are treated like any other unauthenticated request.
- [ ] No secret, key, token, or full request body appears in logs, errors, or responses.

## Tests that really test

- [ ] Each "done when" rule has a test, and each test name says which rule.
- [ ] Each rule has a **positive** test (it works) and a **negative** test (it is refused).
- [ ] Each test **fails when the code is sabotaged** (you showed it).
- [ ] Limits and boundaries are tested on **both sides**, and past the limit.
- [ ] No test passes only because a default does the work. Check what the test would do with the feature removed.
- [ ] Tests do not depend on order, on fixed IDs, or on state from another test.
- [ ] Every test cleans up with `try/finally`, and starts from a clean state.
- [ ] Exact outputs are asserted (full bodies, headers, status), not only "contains".
- [ ] Nothing was weakened, skipped, or deleted. `git diff main...HEAD -- test` shows only additions or justified changes.

## Errors and contract

- [ ] Every error goes through `ApiError` and `errorBody()`, with a `request_id`.
- [ ] Error messages are generic. They never echo input, SQL, paths, or stack traces.
- [ ] `openapi/ledger.v1.yaml` matches the code: every response (200, 400, 401, 403, 404, 409, 422) is documented.
- [ ] Money fields are integer strings in the spec and in the code.

## Money, SQL, and data

- [ ] No `number` for money. No float math. No decimal literals.
- [ ] Every SQL statement is parameterized.
- [ ] A new table has explicit `GRANT`s, only what the app role needs, and a test for the privileges.
- [ ] A new rule that protects money is also a **database** constraint or trigger, not only code.
- [ ] A migration does one thing, has no `Down`, and was not edited after merge.

## Docs and hygiene

- [ ] Docs are synced: search the repo for any name you removed or renamed.
- [ ] `git diff` was read in full. No stray paths, debug code, or commented-out code.
- [ ] `npm run lint && npm run format:check && npm run typecheck && npm run openapi:lint && npm test && npm run build` passes.
- [ ] The feature file is updated, and the CHANGELOG has a line.
