# Platform decisions

Decisions that affect more than one service. Service decisions live in `services/<name>/docs/decisions/`.

Format: one file per decision, named `P-NNNN-short-title.md`. Never edit an accepted decision to change its meaning. Write a new one that replaces it, and mark the old one `replaced by P-XXXX`.

| ID | Title | Status |
| -- | ----- | ------ |
| [P-0001](P-0001-monorepo.md) | One repository with a `services/` folder | accepted |
| [P-0002](P-0002-independent-services-polyglot.md) | Independent services, stack chosen per service | accepted, with conditions |
| [P-0003](P-0003-data-ownership.md) | Each service owns its data. No shared database | accepted |
| [P-0004](P-0004-contract-first-http.md) | HTTP and OpenAPI contracts, versioned and additive | accepted |
| [P-0005](P-0005-ci-and-releases.md) | CI per service and tags per service | accepted |
| [P-0006](P-0006-production-readiness-gate.md) | Launch gate is separate from version tags | accepted |
| [P-0007](P-0007-ai-assisted-execution.md) | AI-assisted execution and its safety controls | accepted |
