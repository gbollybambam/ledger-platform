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
Implement <feature file> one Done-when rule at a time.
- After each rule: run only the affected test file and `npm run typecheck` (output `| tail -40`). Commit with a Conventional Commit.
- Never change, skip, or delete a test to pass. If a test is wrong, stop and explain.
- Add nothing the spec does not ask for. No new dependency without asking.
- Follow services/ledger/docs/patterns.md and the money and database rules in AGENTS.md. Change OpenAPI in the same commit as the code.
- Stuck rule: same failure 3 times or 30 minutes: stop and write the 5-line stuck report.
When all rules pass:
A. SABOTAGE: for each row marked S in the Test plan, make the one-line sabotage, run only that test, show it red (one line), then `git checkout` the file and show green. Never commit a sabotage. A test that stays green is weak: fix it. For rows without S, answer "would this pass without the feature?" and fix any that would.
B. SELF-REVIEW: read docs/process/review-checklist.md and check your diff (`git diff main...HEAD`, not printed in full). Fix violations. Search the docs for removed or renamed names.
C. Run the full check once.
Report: commits (one line each), the S table (row | sabotage | red | restored), checklist items fixed, full-check result with counts and durations. Max 60 lines.
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
