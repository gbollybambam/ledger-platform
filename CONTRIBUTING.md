# Contributing

These are the git rules for this repository. They apply to me and to any LLM that works here.
This is the only place git rules live. Other files link here. They do not copy it.

## The short version

- `main` always works.
- One idea per commit. One feature per branch.
- Every change goes through a pull request, even when I work alone.
- Tests and CI must pass before merge.
- Never commit secrets.
- Tests are never weakened to make CI pass.

## Branches

- `main` is protected. Never commit to it directly. (One exception: the first import of this repository.)
- Branch from `main`. Keep branches short. Merge within days, not weeks.
- Name branches `type/service-short-name`:
  - `feat/ledger-clients-auth`
  - `fix/ledger-deadlock-ordering`
  - `test/ledger-concurrent-transfers`
  - `docs/platform-readiness`
  - `refactor/`, `chore/`, `ci/` follow the same pattern.
- Delete the branch after it is merged.

## Commits

Use Conventional Commits:

```
type(scope): short summary
```

- Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`.
- Scopes: `ledger`, `gateway`, `recon`, `platform`, `db`, `ci`, `docs`.
- Write the summary in the imperative: "add", not "added". Keep it under 72 characters.
- Use the body to explain **why**, not only what.
- One idea per commit.
- The code must work at every commit.
- A bug fix and its test go in the same commit.
- Database migrations go in their own commit.

Examples:

```
feat(ledger): add idempotency key check on transfers
fix(ledger): lock accounts in ID order to prevent deadlock
test(ledger): add concurrent transfer stress test
docs(platform): record decision on service boundaries
```

## Pull requests

- One PR per feature or fix.
- Fill in the PR template (`.github/pull_request_template.md`).
- Link the feature file and any decision.
- Review your own PR first. Read the diff as if someone else wrote it.
- CI must be green.
- Merge with **squash merge**. The PR title becomes the commit on `main`, so use the Conventional Commit format.

## Tests and CI

- Tests run on every PR. Lint, typecheck, and the OpenAPI check run too.
- Database tests use a real PostgreSQL. Do not mock the database.
- Do not merge with failing or skipped tests.
- A fixed bug gets a test that would have caught it.
- Never delete or weaken a test to make it pass. If a test is wrong, explain why in the PR and get approval.

## Secrets

- Never commit secrets, keys, or tokens.
- `.env` is in `.gitignore`. Commit `.env.example` with fake values.
- If a secret leaks, rotate it right away. Deleting the commit is not enough.

## Migrations

- Migrations are forward-only. Never edit a migration that has been merged. Write a new one.
- Each migration is a plain SQL file. A `Down` section is not allowed.

## History safety

- Never rewrite history on a shared branch or on `main`.
- If a force push is needed on my own branch, use `git push --force-with-lease`. Never plain `--force`.

## Versions and tags

Each service has its own version. Use Semantic Versioning. Prefix the tag with the service name. Use annotated tags:

```
git tag -a ledger/v0.1.0 -m "skeleton done, CI green"
git push origin ledger/v0.1.0
```

A tag means "the planned features are built and tested". It does **not** mean "safe for real money". See `docs/production-readiness.md`.

Update the service's `CHANGELOG.md` when you tag.

## Before every push

- [ ] Tests, lint, and typecheck pass locally.
- [ ] Commits are small and use Conventional Commits.
- [ ] No secrets in the diff.
- [ ] The branch has one purpose.
