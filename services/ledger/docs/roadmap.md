# Roadmap (ledger)

The ordered list of features for v1. Work on one at a time, from the top.
Status: `todo` | `in progress` | `done`.

Later versions are in `docs/versions.md`. Do not add them here.
The process for each feature is in `docs/process/feature-loop.md` at the repository root.

## Phase 2

| # | Work | Status | Tag |
| - | ---- | ------ | --- |
| 0 | Skeleton: project, roles, migrations, OpenAPI contract, CI (`docs/features/skeleton.md`) | done | ledger/v0.1.0 |

## Features

| # | Feature | PRD | Status | Feature file | Tag |
| - | ------- | --- | ------ | ------------ | --- |
| F1 | Clients, API keys, and scopes | M1 M14 | todo | `docs/features/F01-clients-auth.md` | |
| F2 | Currencies and accounts | M2 M3 | todo | `docs/features/F02-accounts.md` | |
| F3 | Transactions core: balanced, immutable, cached totals, balance read | M4 M5 M6 | todo | `docs/features/F03-transactions-core.md` | |
| F4 | Idempotency for all POSTs | M7 | todo | `docs/features/F04-idempotency.md` | |
| F5 | Concurrency proof: stress tests, deadlock and timeout handling | M8 | todo | `docs/features/F05-concurrency-proof.md` | |
| F6 | Reversals | M9 | todo | `docs/features/F06-reversals.md` | |
| F7 | Ledger verify | M10 | todo | `docs/features/F07-ledger-verify.md` | **ledger/v0.2.0** |
| F8 | Query API: entries, lookups, global list with watermark | M11 | todo | `docs/features/F08-query-api.md` | **ledger/v0.3.0** |
| F9 | Hardening: contract validation, logs, shutdown, backup and restore drill, benchmark | M12 M13 S1 | todo | `docs/features/F09-hardening.md` | |
| F10 | Release: README, runbook, known limits, readiness report | M15 | todo | `docs/features/F10-release.md` | **ledger/v1.0.0** |

Only F1 has a written feature file now. Before each later feature starts, the planner writes its file (use the "spec request" prompt in `docs/process/kickoff-prompts.md` at the repository root). The executor does not invent a spec.

## Cut line

All of F1 to F10 are required for `v1.0.0`, because the ledger is meant for real money. Only these may be cut:

1. The benchmark in F9 (S1).
2. Mutation testing (S2).

**Never cut F10.** An unfinished runbook means an unfinished service.

## Milestones

- `ledger/v0.0.0`: docs done
- `ledger/v0.1.0`: skeleton done, CI green
- `ledger/v0.2.0`: ledger core done (F1 to F7)
- `ledger/v0.3.0`: query API done (F8)
- `ledger/v1.0.0`: every must-have in `docs/prd.md` done