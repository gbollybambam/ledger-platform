# P-0007: AI-assisted execution and its safety controls

- Date: 2026-10-27
- Status: accepted

## Decision

- **Planner (Claude):** designs, writes specs, ADRs, invariants, and feature files, writes the review prompt, and unblocks.
- **Executor (GitHub Copilot CLI with GPT 5.6 Luna):** writes all code, tests, and migrations from those specs.
- **Owner (the human):** decides, runs the loop, merges, and escalates.

This replaces the earlier rule "write the hard parts by hand". Because the owner will not read every line, safety must not depend on reading the code. These controls are required:

1. **Tests come from the spec, before the code.** The executor writes failing tests for each "done when" rule first.
2. **The database enforces the rules.** Immutability, balance, no-overdraft, and uniqueness are constraints and triggers, not only code.
3. **Least privilege.** The running service cannot change history or the schema, even if the code is wrong.
4. **Tests may not be weakened to pass.** Changing or deleting a test needs the owner's approval and a written reason.
5. **Hard gates in CI.** Lint (with money rules), typecheck, tests on a real database, OpenAPI contract checks, audit.
6. **Complex parts get extra oversight.** Each feature file lists them. The planner writes the algorithm and the test cases first, and reviews the result.
7. **Two review passes at most per feature,** against the invariants (see `docs/process/feature-loop.md`).
8. **Independent review before real money.** A human engineer reviews the ledger design and critical code. A different model does an adversarial review. See the launch gate.

## Rejected options

- Trusting AI output without independent checks.
- The owner reviewing every line. It is not realistic here.

## Why

Money bugs hide in rare cases that nobody sees by reading. Constraints, property tests, and concurrency tests find them. Independent review finds what the same author misses.

## Trade-offs and risks

The test suite becomes the real specification. If the tests are wrong or weak, the system is wrong. The planner reviews test quality, not only code.
