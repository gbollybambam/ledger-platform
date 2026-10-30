# Ledger Platform

A platform for handling money, built as separate services:

| Service | Purpose | Stack | Status |
| ------- | ------- | ----- | ------ |
| [`services/ledger`](services/ledger) | Double-entry ledger: the source of truth for balances | Node.js, TypeScript, PostgreSQL | Phase 2 done. Phase 3 (features) next |
| `services/gateway` | Payment provider integration | not decided yet | not started |
| `services/recon` | Reconciliation with provider statements | not decided yet | not started |

**This system is designed for real money. A passing build is not a launch approval.** Before real money flows, every item in [docs/production-readiness.md](docs/production-readiness.md) must be done and signed off.

## Start here

1. Read [docs/process/start-here.md](docs/process/start-here.md). It has the exact commands to verify and begin.
2. Read [docs/architecture-assessment.md](docs/architecture-assessment.md) for why the platform is shaped this way.
3. Read [services/ledger/README.md](services/ledger/README.md) to run the ledger.

## Layout

```
AGENTS.md  CONTRIBUTING.md  README.md
docs/
  architecture-assessment.md   why three services, the risks, the alternatives
  production-readiness.md      the launch gate for real money
  decisions/                   platform decisions (P-0001 ...)
  process/                     the feature loop, prompts, start-here
.github/                       PR template, Dependabot, CI per service
services/
  ledger/                      active
```

## Rules

- Git rules: [CONTRIBUTING.md](CONTRIBUTING.md)
- Rules for LLM tools: [AGENTS.md](AGENTS.md)
