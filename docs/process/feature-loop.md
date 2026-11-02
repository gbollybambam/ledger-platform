# The feature loop (version 2)

The same loop for every feature, in every service. The executor is the CLI model (see [P-0007](../decisions/P-0007-ai-assisted-execution.md)).

Roles: **Owner** (you) runs the loop and merges. **Executor** (Copilot CLI, GPT 5.6 Luna) writes 100% of the code, tests, and migrations. **Planner** (Claude) writes specs and reviews complex parts. **Second reviewer** (another model, for example Gemini in chat) reviews with fresh eyes.

Prompts for each step are in [kickoff-prompts.md](kickoff-prompts.md). What went wrong before, and the rules that came from it: [lessons-from-f1.md](lessons-from-f1.md).

## What changed from version 1

1. The spec is sharper: it lists **decisions already made**, **exact formats**, **exact files**, and a **test plan** with a sabotage for every rule. The executor asks questions in **one batch**, and only about things that are not decided.
2. A **sabotage check** and a **self-review** happen before anyone else reviews (they used to be found in review).
3. **One** review pass is normal. A second pass happens only if the first found "fix now" items.
4. The review is done by a **different model**, with the diff as a file.
5. A short **retro** after each merge feeds the lessons file.

## The steps

1. **Pick the feature.** The next `todo` row in the service's `docs/roadmap.md`. Never skip ahead.
2. **Get the spec** (planner, prompt 7). It uses `docs/features/_template.md`. **Spec check (5 minutes, owner):** is every choice that could be a question already in "Decisions already made"? Is every rule testable? Does every rule have a sabotage? If not, send it back before you start.
3. **Start a fresh session** on a new branch (`feat/ledger-<name>`). Paste prompt 1. The executor reads the files and replies with a summary, its file list, risks, and **all** its questions in one list. Answer them once. If it has no questions it says `NONE`.
4. **Tests first** (prompt 2). The executor writes failing tests from the spec's test plan. **Owner gate:** compare the list of test names with the test plan table. Each must fail for the right reason. No implementation yet.
5. **Build, then prove** (prompt 3). The executor implements one rule at a time in small commits. When every rule passes, it runs the **sabotage check** (for each rule, break the code on purpose and show the test fails) and the **self-review checklist** (`review-checklist.md`), fixes what it finds, and reports. **Owner gate:** read the sabotage report. Every rule must show a failing test.
6. **Review** (prompt 4). Use a different model. Give it the diff as a file, the invariants, and the "Done when" list. Sort findings with the matrix below. Fix the "fix now" ones. Log everything in the feature file.
7. **Second pass only if** the first pass had "fix now" items. Otherwise skip it.
8. **Planner review of complex parts** (prompt 8), only when the feature file lists complex parts.
9. **Done check** (prompt 5). Every box ticked with a named test. Docs synced. CI green on the PR.
10. **Merge.** Squash merge. Roadmap to `done`. CHANGELOG line. Add a decision record if a major choice was made.
11. **Retro** (prompt 11). Paste the answers in the feature file Metrics, and add rows to `lessons-from-f1.md` for anything new.

## Review prompt

```
Review this code only against the rules below.

Rules:
<paste the service's docs/invariants.md and the feature's "Done when" checklist>

Constraints:
- Do not suggest new features.
- List at most 5 issues, ranked by risk.
- For each issue, state what breaks and provide the exact fix.
- If nothing is critical, state "No critical issues."
```

For the second reviewer, also attach the diff and `docs/process/review-checklist.md`, and add: "Also check each item of the checklist. Report only items that are violated."

To make the diff file (Git Bash, from the repository root):

```
git --no-pager diff main...HEAD -- . ':!services/ledger/package-lock.json' > ~/Desktop/review.diff
```

## Finding classification matrix

| Finding | Action |
| ------- | ------ |
| Breaks money or data integrity | **Fix now** |
| Breaks a v1 functional requirement or a "Done when" rule | **Fix now** |
| A test that would pass without the feature (a weak test) | **Fix now** |
| Everything else (style, minor refactors) | Log in the service's `BACKLOG.md` and move on |

A "Done when" rule is never "fix later".

## The stuck rule

The executor is **stuck** if the same check still fails after 3 real attempts, or there is no progress for 30 minutes.

1. Stop. Do not loop alone.
2. Write the problem in 5 lines (prompt 6).
3. Send it to the planner (prompt 9). The planner finds the cause and gives the exact fix, or changes the spec.

## Complex parts

Each feature file lists its complex parts (locking, multi-account writes, security-sensitive code, anything hard to see by reading). For these:

1. The planner writes the algorithm and the test cases **in the spec**, before the executor starts.
2. The executor implements exactly that. It keeps the reasoning in code comments.
3. The planner reviews the diff (prompt 8) before the feature is done.

## Definition of done

- Every "Done when" box is ticked, each with a test that fails when the rule is broken (the sabotage report proves it).
- All invariants still hold.
- `npm run lint && npm run format:check && npm run typecheck && npm run openapi:lint && npm test && npm run build` passes.
- CI is green on the PR.
- No test was weakened, skipped, or deleted without a written reason that the owner approved.
- The OpenAPI file matches the code, and the docs are synced (no removed name is still mentioned).
- The feature file, roadmap, and CHANGELOG are updated.

## Session hygiene

- One feature per session. Start fresh for the next.
- If the model repeats itself or forgets rules, end the session and start again with prompt 1.
- Never paste file paths or secrets into a running session. Read `git diff` before every commit.
- Run destructive commands only against throwaway databases.

## Targets

| Measure | A good feature |
| ------- | -------------- |
| Questions from the executor | 0 to 1 |
| "Fix now" findings in review pass 1 | 0 to 3 |
| Review passes | 1 |
| Weak tests found in review | 0 |
