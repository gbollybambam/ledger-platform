# Backlog (ledger)

Minor review findings go here. They are not part of the current feature.
Nothing here blocks a merge. Check this file when planning the next version.

Format: `- [feature] what -- why it can wait -- date`

## Review findings

<!-- Example: - [F3] add an index on entries(created_at) -- not needed until F8 -- 2026-11-02 -->

- [skeleton] Document how the test database is reset between runs on a developer machine -- tests are idempotent, so nothing is needed yet -- 2026-10-27
- [F1] Reject tokens that are not `lk_` plus 43 characters before the database query -- saves a query per garbage request -- 2026-10-31
- [F1] Accept bearer in lowercase -- the scheme is case-insensitive by standard -- 2026-10-31
- [F1] Narrow the logger option type -- `{...logger}` breaks if a logger instance is passed -- 2026-10-31
- [F1] Move the `import type` lines in `app.ts` to the top -- style cleanup only -- 2026-10-31
- [F1] Return 503, not 500, if the database is down during authentication -- make database availability explicit in the API contract -- 2026-10-31
- [F1] Include the per-request authentication query in the F9 benchmark -- every authenticated request costs one database query -- 2026-10-31
- [F1] Run most client-admin cases in-process with injected writers, keeping one or two real npm smoke tests -- reduce subprocess cost while preserving CLI coverage -- 2026-11-01
- [F1] Prevent `client.end()` in `finally` from hiding an original error -- preserve the first failure during cleanup -- 2026-11-01
- [F1] Document that health probes with a query string receive 401 -- make the exact public health URL contract clear in the runbook -- 2026-11-01
- [C1] Reduce client-admin real-process smoke startup cost -- the create/list/revoke smoke test dominates suite time -- 2026-11-02
- [F9] A burst of duplicate requests with the same key holds one pool connection each for up to lock_timeout (5 s). Consider a per-client concurrency limit or an advisory-lock queue in F9 or v1.1.
- [F2] appError() in idempotency-migration.test.ts catches its own 'expected app query to fail' error; restructure it.

## Later ideas

Later ideas live in `docs/versions.md`. Do not copy them here.
