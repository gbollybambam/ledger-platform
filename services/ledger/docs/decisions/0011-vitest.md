# DEC-0011: Vitest as the test runner

- Date: 2026-10-27
- Status: accepted

## Decision

Use Vitest. The tests use the same style as Jest: `describe`, `it`, `expect`.

## Rejected options

- Jest with ts-jest. It needs extra setup for TypeScript and ES modules.
- The built-in Node test runner. Fewer features for the test helpers I want.

## Why

It runs TypeScript and ES modules with no extra setup. It is fast. The API is close to Jest, so the skills carry over.

## Trade-offs and risks

The earlier plan said Jest. The difference is small. Vitest does **not** check types, so `npm run typecheck` is a separate step, and CI runs both. (This caught a real mistake during setup.) Test files run one at a time, because they share one real Postgres.
