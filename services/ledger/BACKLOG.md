# Backlog (ledger)

Minor review findings go here. They are not part of the current feature.
Nothing here blocks a merge. Check this file when planning the next version.

Format: `- [feature] what -- why it can wait -- date`

## Review findings

<!-- Example: - [F3] add an index on entries(created_at) -- not needed until F8 -- 2026-11-02 -->

- [skeleton] Document how the test database is reset between runs on a developer machine -- tests are idempotent, so nothing is needed yet -- 2026-10-27
- [F1] Add token-format validation before the authentication database query -- useful optimization and clearer invalid-token handling, but not required for current correctness -- 2026-10-31
- [F1] Accept the Bearer scheme case-insensitively -- current behavior follows the narrow existing contract and can be broadened later -- 2026-10-31
- [F1] Narrow the logger option type -- current Fastify logger composition is correct, but the public dependency type can be made more precise later -- 2026-10-31
- [F1] Move `import type` declarations to the top of `src/app.ts` -- style cleanup only; no runtime effect -- 2026-10-31
- [F1] Return 503 instead of 500 when the database is unavailable during authentication -- requires an explicit API availability policy and is not part of F1 -- 2026-10-31
- [F1] Include the per-request authentication query in the F9 benchmark -- performance measurement belongs with the F9 benchmark work -- 2026-10-31

## Later ideas

Later ideas live in `docs/versions.md`. Do not copy them here.
