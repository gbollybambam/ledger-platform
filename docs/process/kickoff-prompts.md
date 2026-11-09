# Prompts (version 3: leaner)

Fill in `<angle brackets>`. Start the CLI from the repository root. Ledger commands run from `services/ledger`.

## 1. Session A: read (short)

```
You are the executor for the ledger service. You write code and tests. You do not decide scope.
Read: AGENTS.md, services/ledger/AGENTS.md, services/ledger/docs/invariants.md, services/ledger/docs/patterns.md, <feature file>, and only the RFC sections and decision records the feature file lists.
Reply in at most 25 lines, in these sections. Write no code. Change no file.
1. Summary (5 lines max)
2. Invariants touched
3. Questions: ALL in ONE numbered list. Do not ask about anything the feature file already decides. If none, write NONE.
4. Risks: anything unsafe or conflicting in the spec.
After my answer, ask nothing more unless two statements truly conflict.
```

## 2. Session A: tests first

```
Write the failing tests for <feature file>, following its Test plan table exactly (one test or case set per row, same names) plus the listed edge cases.
Rules: real database, no mocks; helpers from test/helpers; unique fixtures; cleanup in try/finally; each rule has a positive and a negative test; limits tested on both sides and past the limit. Stubs only as needed to compile, and they throw new Error('not implemented'). No implementation.
Run only the new test files, with output piped through `| tail -40`. Report a table: test name | row | fails because. Max 45 lines. Show `git show --stat HEAD`. Commit the tests alone.
```

## 3. Session B: build and prove

```
Implement exactly the feature file named by the caller. Do not infer a different feature.

PRECHECK (must finish before editing):
1. Confirm the feature file exists and contains a Done-when list and Test plan.
2. Read its Status, Done-when list, Files, and Test plan.
3. Check `git status --short` and stop if existing changes overlap files you must edit.
4. Build a fixed queue from the Done-when list. One queue item is one implementation rule.
   Test-plan rows are evidence for those rules, not additional implementation rules.
5. If any precheck fails, stop immediately and report the failed check in at most 10 lines.

For exactly one queue item per turn:
1. State the item number and quote its exact Done-when text.
2. Identify the affected test file(s). If none exists, stop and report that.
3. Write or update only the tests required for this item. Never change, skip, weaken, or
   delete a test to make it pass. If a test is wrong, stop and explain.
4. Implement only this item and its direct dependencies. Do not start the next item.
5. Run only the affected test file(s), then run `npm run typecheck | tail -40`.
6. If either check fails, retry at most twice. On the third failure of the same cause,
   stop and write the five-line stuck report.
7. If both checks pass, inspect `git diff --stat`, commit with a Conventional Commit,
   report the commit, and STOP. Wait for the next turn.

Rules:
- Follow `services/ledger/docs/patterns.md` and the money/database rules in AGENTS.md.
- Change OpenAPI in the same commit as the code it documents.
- Do not add dependencies without asking.
- Do not update AIC metrics unless the caller provides the value.
- Do not run sabotage, self-review, or the full check in this prompt.

Only after the caller explicitly says `FINALIZE <feature file>`:
1. Run sabotage for rows marked S. Make one temporary production-line change, run only
   that row's test, record red output, restore that exact line, and record green output.
   Never use `git checkout` on a whole file and never commit sabotage.
2. For rows without S, answer whether the test would pass without the feature and fix weak tests.
3. Read `docs/process/review-checklist.md`, inspect `git diff main...HEAD` without printing
   the full diff, and fix violations.
4. Run the full check once.
5. Report commits, the S table, checklist fixes, and full-check counts/duration in at most 60 lines.
```

## 4. Review (give to Gemini with review.diff)

```
Review this code only against the rules below.
Rules: <paste invariants.md and the feature's "Done when" list>
Constraints: do not suggest new features. At most 5 issues, ranked by risk. For each: what breaks and the exact fix. If nothing is critical, say "No critical issues."
Also check each item of the attached checklist and report only violated items.
Look especially for: tests that pass without the feature, tests that read SQL or YAML text instead of testing behavior, always-true assertions, state shared between tests, SQL outside the checked-out connection, error paths that skip rollback or release.
```

Diff file (Git Bash, repository root): `git --no-pager diff main...HEAD -- . ':!services/ledger/package-lock.json' > ~/Desktop/review.diff`

## 5. Done check

```
Done check for <feature file>. Max 30 lines.
1. For every Done-when item: the test that proves it, pass or fail.
2. Full check result (counts, duration).
3. `git diff main...HEAD -- services/ledger/test --stat`: confirm no test was weakened or deleted.
4. OpenAPI matches the code. Docs synced.
5. Tick the proven boxes, fill Metrics, set Status. CHANGELOG line.
Do not tick what you cannot prove.
```

## 6. Stuck report (the executor writes it)

```
Stop. Five lines: 1 Goal. 2 Command. 3 Result (shortest useful part). 4 Tried, in order. 5 Theory. Add the branch name and last commit hash. Try nothing else.
```

## 7. Spec request (to Claude)

```
Write the feature file for <feature> in the ledger service, using services/ledger/docs/features/_template.md and the style of F03-accounts.md. Ask me every open product question in ONE list, with your recommendation after each, before you write. Say if the RFC, invariants, or decisions need a change first (you own those).
```
Attach: `invariants.md`, `rfc-001.md`, `roadmap.md`, `patterns.md`, the previous feature file with Metrics, `lessons-from-f1.md`.

## 8. Planner review (to Claude, every feature)

```
Planner review of <feature file>.
Attached: the feature file, the diff of src and migrations only (git --no-pager diff main...HEAD -- services/ledger/src services/ledger/migrations services/ledger/openapi > ~/Desktop/f.diff), the list of test names, and the S sabotage table.
Check: code vs the spec's algorithm; which tests catch each failure; weak sabotage rows; missing tests; invariants. At most 7 findings, ranked, with the exact fix. If I should also see specific test files, say which.
```

## 9. Escalation (to Claude)

```
The executor is stuck on <feature>. Stuck report: <5 lines, branch, last commit>. Attached: the feature file, the failing output, the relevant files. Find the cause. Give the exact fix, or the corrected spec text.
```

## 11. Retro (in the CLI, after the merge)

```
Retro for <feature file>. At most 5 bullets, no file changes. 1 What in the spec or files was unclear or missing? 2 What did you guess? 3 Which step cost the most, and why? 4 One change to the spec template or prompts that would save the most. 5 Which helper or pattern was missing?
```
