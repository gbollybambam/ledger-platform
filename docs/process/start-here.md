# Start here: verify, commit, and begin Phase 3

Follow these steps in order. Every command was written to be run exactly as shown.

Paths: the repository root is the folder called `ledger-platform` (where this file's `docs/` folder is). The ledger service is `services/ledger`.

## 0. What is built and what is not

| Part | State |
| ---- | ----- |
| Platform docs, platform decisions, process | written |
| Ledger Phase 1: PRD, RFC-001, invariants, roadmap, versions, decisions DEC-0001 to DEC-0019, F1 feature file | written |
| Ledger Phase 2: service skeleton, database roles, migrations, OpenAPI contract, Dockerfile, CI | built. Checked by the planner on PostgreSQL 17 (35 tests) |
| Ledger features F1 to F10 | not started |
| Gateway, reconciliation | not started, not planned (on purpose) |

**Not verified by the planner** (no Docker on its machine): `docker compose`, `docker build`, the GitHub Actions run, and how your Copilot CLI loads instruction files. Step 1 and step 4 check these for you.

## 1. Pre-flight: prove Phase 1 and 2 pass on your machine

You need: Git, Node.js 22.9 or newer (24 recommended), Docker running.

```
cd ledger-platform/services/ledger
node -v
npm ci
cp .env.example .env
npm run db:up
npm run db:setup
```

On Windows PowerShell, use `copy .env.example .env` instead of `cp`.

Expected:

- `node -v` prints `v22.9` or higher.
- `npm ci` ends with "found 0 vulnerabilities".
- `npm run db:up` starts two containers and waits until they are healthy.
- `npm run db:setup` prints "database roles are ready", then "Migrations complete!" (with "No migrations to run!" because there are none yet).

Now run every check:

```
npm run lint
npm run format:check
npm run typecheck
npm run openapi:lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
docker build -t ledger:local .
```

Expected:

- `npm test` ends with `Test Files  6 passed (6)` and `Tests  35 passed (35)`.
- `docker build` ends without errors.

Smoke test the service and the image:

```
npm run dev
```

In a second terminal:

```
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

Expected: `{"status":"ok"}` and `{"status":"ok","db":"up"}`. Stop the dev server with Ctrl+C.

Optional, to prove the container works:

```
docker run --rm -p 3001:3000 -e DATABASE_URL=postgres://ledger_app:change-me-app@host.docker.internal:5432/ledger_dev ledger:local
```

Then `curl http://localhost:3001/health`. (On Linux, add `--add-host=host.docker.internal:host-gateway`.)

If something fails:

| Symptom | Likely cause |
| ------- | ------------ |
| `TEST_ADMIN_DATABASE_URL is not set` | You did not create `.env`. Run `cp .env.example .env` |
| `ECONNREFUSED` on port 5432 or 5433 | Docker is not running, or `npm run db:up` did not finish |
| Port already in use | Another Postgres is running. Stop it, or change the ports in `docker-compose.yml` and `.env` |
| `PostgreSQL 17 or newer is required` | Another Postgres is answering on the port. Stop it |
| `permission denied` in `db:setup` | `ADMIN_DATABASE_URL` is not the superuser from `docker-compose.yml` |

Do not go on until everything above passes. If it does not, send me the exact command and the last 20 lines of output (the stuck report, prompt 6 or 9 in `kickoff-prompts.md`).

## 2. Git baseline

From the repository root:

```
cd ledger-platform
git init -b main
git status
```

`git status` must **not** list `.env` or `node_modules`. If it does, stop and fix `.gitignore`.

Make four small commits (the first import is the one allowed exception to "never commit to main"):

```
git add .gitignore .gitattributes .editorconfig README.md AGENTS.md CONTRIBUTING.md .github/pull_request_template.md .github/dependabot.yml
git commit -m "chore(platform): add repository rules and templates"

git add docs
git commit -m "docs(platform): add architecture assessment, platform decisions, and process"

git add services/ledger/docs services/ledger/AGENTS.md services/ledger/README.md services/ledger/CHANGELOG.md services/ledger/BACKLOG.md
git commit -m "docs(ledger): add PRD, RFC-001, invariants, roadmap, versions, and decisions"
git tag -a ledger/v0.0.0 -m "ledger phase 1 docs done (independent review pending)"

git add services/ledger .github/workflows
git commit -m "chore(ledger): add service skeleton, database roles, migrations, and CI"
```

Check: `git status` shows a clean tree, and `git log --oneline` shows four commits.

## 3. Push and set up GitHub

1. Create an empty repository on GitHub. Do not add a README or a license there.
2. Then:

```
git remote add origin <your repository URL>
git push -u origin main
git push origin ledger/v0.0.0
```

3. Wait for the `ledger-ci` workflow to finish on `main`. **It must be green.** If it is red, send me the failing step and its log. This is the first run of Docker and Actions, which I could not run.
4. In the repository settings, set up:
   - Branch protection (or a ruleset) on `main`: require a pull request and require the `ledger-ci / test` check. Block force pushes.
   - Secret scanning and push protection (private repositories may need a paid plan).
   - Dependabot alerts and security updates.
5. Tick the boxes in `services/ledger/docs/features/skeleton.md` that are now proven. Set the roadmap row 0 to `done`. Move the changelog lines under `[0.1.0]` with the date. From now on use a branch and a PR:

```
git switch -c docs/ledger-skeleton-done
git add -A
git commit -m "docs(ledger): mark skeleton done"
git push -u origin docs/ledger-skeleton-done
```

Open a PR, wait for green, squash merge. Then:

```
git switch main
git pull
git tag -a ledger/v0.1.0 -m "skeleton done, CI green"
git push origin ledger/v0.1.0
```

## 4. Confirm the new decisions

These are new because of the move to separate services. They are marked **accepted** by default. Read them. Tell me which to change **before** F1 starts.

| Decision | In one line |
| -------- | ----------- |
| P-0002 | Three services. Gateway and recon stacks chosen only when they start, with the "second language must earn its place" test |
| P-0007 | The CLI model writes all code. Controls replace reading every line |
| DEC-0013 | API-key clients and scopes are in v1 (not v1.1) |
| DEC-0014 | `external_ref` is unique per client |
| DEC-0015 | Currency allow-list table |
| DEC-0016 | Three database roles, least privilege |
| DEC-0017 | Migrations: `node-pg-migrate`, plain SQL, forward-only |
| DEC-0018 | OpenAPI 3.0 contract first, with a drift test |
| DEC-0019 | Safe listing with a 30-second watermark (needs PostgreSQL 17) |

Also: get an independent engineer to read `services/ledger/docs/rfc-001.md` (it ends with 6 questions). It is cheap now and expensive later. It is required before real money.

## 5. Phase 3: start F1

Verify how your CLI loads instructions (once):

```
cd ledger-platform
copilot
```

Ask it: `List every instruction file you have loaded for this repository.` If `AGENTS.md` is missing from the list, tell me. The prompts below name the files explicitly, so they work either way.

Create the branch and start:

```
git switch main
git pull
git switch -c feat/ledger-clients-auth
copilot
```

Then paste the prompts from `docs/process/kickoff-prompts.md`, in this order. For F1, fill in the feature file as `services/ledger/docs/features/F01-clients-auth.md`:

1. **Prompt 1**: load the context. Read its answer. Check that it lists INV-11, INV-12, INV-14, and INV-16, and that it asks about anything unclear. Correct it if it misses the "no plaintext key" or "same 401 for every failure" parts.
2. **Prompt 2**: tests first. Check that each test fails for the right reason.
3. **Prompt 3**: build. Watch for a test being edited. If you see that, stop it.
4. **Prompt 4**: review, pass 1. Sort the findings with the matrix. Fix "fix now" items. Write the log in the feature file.
5. **Prompt 8** (to me): the complex-part review for F1. Send the feature file, `git diff main...HEAD -- services/ledger/src services/ledger/scripts`, and the list of test names.
6. **Prompt 4**: review, pass 2. Then stop reviewing.
7. **Prompt 5**: done check.
8. Open the PR, wait for green CI, squash merge. Set F1 to `done` in the roadmap.

If the CLI is stuck: prompt 6, then send prompt 9 to me.

## 6. Next feature

Send me prompt 7 ("spec request") for F2, with the files it lists. I write the feature file. Then repeat step 5 from the top. I do not write a feature file before the previous feature is merged, so each spec can use what was learned.

## 7. Before real money

`v1.0.0` is not a launch. Read `docs/production-readiness.md`. Every item must be done and signed off first.
