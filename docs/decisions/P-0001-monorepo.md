# P-0001: One repository with a `services/` folder

- Date: 2026-10-27
- Status: accepted

## Decision

All services live in one Git repository under `services/<name>/`. Platform-wide docs, rules, and CI live at the root. Each service has its own folder, toolchain, `AGENTS.md`, docs, and CHANGELOG.

```
ledger-platform/
  AGENTS.md  CONTRIBUTING.md  README.md
  docs/                 platform docs, decisions (P-), process
  .github/              PR template, Dependabot, one CI workflow per service
  services/
    ledger/             Node.js + TypeScript (active)
    gateway/            not started
    recon/              not started
```

## Rejected options

- One repository per service. Cross-service changes (a contract change plus its clients) become several PRs that must land in order.
- A shared `packages/` folder with common code. Languages differ, so shared code is rare. Shared **contracts** (OpenAPI files) are enough.

## Why

One place for rules, reviews, and history. An LLM can see the whole system. A contract change and its clients can land in one PR.

## Trade-offs and risks

CI must not run every service for every change forever (see P-0005). Tags are per service (`ledger/v1.0.0`). The repository can be split later because services share no code.
