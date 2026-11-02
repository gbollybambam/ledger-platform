# AGENTS.md (repository root)

Rules for any LLM working in this repository. Keep this file short.
**When you work inside a service, also read that service's `AGENTS.md`.** Start with `services/ledger/AGENTS.md`.

## Project

A platform that handles money: ledger, payment gateway, and reconciliation, as separate services.
**Only the ledger (`services/ledger`) is being built now. Do not start or plan the gateway or reconciliation.**
This system is designed for real money. Correctness and safety come before speed and cleverness.

## Who does what

- The owner decides and merges.
- Claude (chat) plans: specs, decision records, invariants, feature files. It also reviews and unblocks.
- You (the CLI model) write the code, tests, and migrations from those specs.
- See `docs/decisions/P-0007-ai-assisted-execution.md`.

## Where things live

| Need                                | File                                              |
| ----------------------------------- | ------------------------------------------------- |
| Git, commits, PRs, tags             | [CONTRIBUTING.md](CONTRIBUTING.md)                |
| The work loop for every feature     | `docs/process/feature-loop.md`                    |
| Past mistakes and the rules from them | `docs/process/lessons-from-f1.md`               |
| Self-review checklist               | `docs/process/review-checklist.md`                |
| Prompts for each step               | `docs/process/kickoff-prompts.md`                 |
| Why the platform is shaped this way | `docs/architecture-assessment.md`, `docs/decisions/` |
| What must be true before real money | `docs/production-readiness.md`                    |
| A service's own rules and docs      | `services/<name>/AGENTS.md`, `services/<name>/docs/` |

## Rules for every task

1. Use simple words and short sentences when you explain. Explain **why**, not only what.
2. Work on one feature at a time. Start from its feature file.
3. Write tests first, from the "done when" rules and the test plan. Show that they fail for the right reason. Then implement. When all rules pass, run the sabotage check and the self-review (`docs/process/review-checklist.md`).
4. **Never weaken, skip, or delete a test to make it pass.** If you think a test is wrong, stop and explain.
5. **Never edit** these without asking the owner: invariants, decision records, the roadmap, `AGENTS.md`, CI workflows, or any merged migration.
6. Do not add features, layers, or abstractions that the feature file does not ask for.
7. Do not build anything from a later version. Check the service's `docs/versions.md`.
8. Ask before you add a dependency. Say why it is needed and what else you considered.
9. Money is never a floating-point number. See the service rules.
10. Ask all your questions in ONE list, once, and never about anything the feature file already decides. If you are stuck, use the stuck rule in `docs/process/feature-loop.md`.

## Never

- Never touch real secrets, production data, or production access.
- Never commit `.env` or any key or token.
- Never log secrets or full API keys.
- Never rewrite history on `main`.
- Never read or write another service's database.
- Never make a network call while holding a database transaction with locks.
- Never run a destructive command (`DROP`, `TRUNCATE`, `git reset --hard`, `rm -rf`) outside a throwaway test database or a temp folder without asking.
