# Prompts for each step (version 2)

Copy a prompt, fill in `<angle brackets>`, and paste it into the CLI session. All paths are from the repository root.

Start the CLI from the **repository root**. Commands for the ledger run from `services/ledger`.

## 1. Load the context (start of every session)

```
You are the executor for the ledger service in this repository. You write the code and the tests. You do not decide scope.

Read these files completely before you do anything else:
1. AGENTS.md
2. services/ledger/AGENTS.md
3. services/ledger/docs/invariants.md
4. services/ledger/docs/rfc-001.md
5. services/ledger/docs/patterns.md
6. docs/process/feature-loop.md
7. docs/process/review-checklist.md
8. <feature file, for example services/ledger/docs/features/F02-idempotency.md>
9. Every file the feature file lists under "Reads first".

Then reply with exactly these sections. Do NOT write code or change any file.
1. Summary: 8 lines or fewer.
2. Invariants touched (INV-xx).
3. Files you will create or change: exact paths.
4. Questions: ALL of them in ONE numbered list. First check "Decisions already made" and "Exact formats" in the feature file. Do not ask about anything listed there. If you have no questions, write NONE.
5. Risks: anything in the spec that could be implemented in an unsafe way, or that conflicts with another file.
6. Instruction files you loaded.

After I answer, do not ask more questions unless you find a real contradiction. If you do, say exactly which two statements conflict.
```

## 2. Tests first

```
Write the failing tests for <feature file>.

Rules:
- Follow its "Test plan" table: one test (or one set of cases) per row, using the exact test names from the table. Add the edge cases listed under "Edge cases that must be tested".
- Each rule needs a positive and a negative test. A limit is tested on both sides and past the limit.
- Use the real database. Do not mock it. Use the helpers in test/helpers/ if they exist. Unique fixtures per test, cleanup in try/finally, no fixed IDs.
- Do not write any implementation, except the smallest empty stubs needed to compile.
- Run the tests. Show each failing, with the reason. A test that fails because of a typo or a missing import is not done.
- Do not weaken a rule to make it easier to test. If a rule cannot be tested as written, stop and tell me.
- Commit the tests alone, with a Conventional Commit message.
Then print a table: test name, rule, why it fails now.
```

## 3. Build, then prove

```
Now implement <feature file>, one "Done when" rule at a time.

Rules:
- Make one rule pass, run the full check, then commit. Small commits. Conventional Commits.
- Full check: cd services/ledger && npm run lint && npm run format:check && npm run typecheck && npm run openapi:lint && npm test && npm run build
- Never change, skip, or delete a test to make it pass. If you think a test is wrong, stop, explain, and wait for me.
- Do not add anything the feature file does not ask for. Do not add a dependency without asking me.
- Follow services/ledger/docs/patterns.md and the money and database rules in services/ledger/AGENTS.md.
- Change the OpenAPI file in the same commit as the code.
- If the same check fails 3 times, or you make no progress for 30 minutes, stop and write a stuck report (prompt 6).

When every rule passes, do these two things before you report:

A. SABOTAGE CHECK. For each row in the "Test plan" table: make the one-line sabotage named in the table (or a better one), run only that test, and show it FAIL. Then restore the code with git checkout and show the test pass. Never commit a sabotage. If a test does NOT fail under sabotage, the test is weak: fix the test, and tell me.
B. SELF-REVIEW. Go through docs/process/review-checklist.md against your own diff (git diff main...HEAD). Fix every violation. Search the docs for any name you removed or renamed.

Report: the commits, a table (rule, test, sabotage used, result), and the checklist items you fixed.
```

## 4. Review (give it to a different model, with the diff file)

```
Review this code only against the rules below.

Rules:
<paste services/ledger/docs/invariants.md, then the "Done when" list of the feature file>

Constraints:
- Do not suggest new features.
- List at most 5 issues, ranked by risk.
- For each issue, state what breaks and provide the exact fix.
- If nothing is critical, state "No critical issues."

Also check each item of the attached checklist (docs/process/review-checklist.md). Report only items that are violated.
Attached: the diff (review.diff), the feature file, the invariants, and the checklist.
```

After the review: sort each finding with the matrix in `docs/process/feature-loop.md`. Give the "fix now" items to the CLI (with the instruction: tests first, show each failing, small commits). Put the rest in `services/ledger/BACKLOG.md`. Write the result in the feature file under "Review log".

## 5. Done check

```
Do the done check for <feature file>.

1. For every "Done when" item, name the test that proves it, and say whether it passes.
2. Run the full check and show the result.
3. Check that no test was weakened, skipped, or deleted: git diff main...HEAD -- services/ledger/test
4. Check that openapi/ledger.v1.yaml matches the code, and that the docs are synced (search for removed or renamed names).
5. Tick the proven boxes in the feature file. Set Status to "done" only if all are ticked. Fill in the Metrics section as far as you can.
6. Add a line to services/ledger/CHANGELOG.md under [Unreleased].
Do not tick a box you cannot prove. Tell me what is missing.
```

## 6. Stuck report (the executor writes this)

```
Stop. Write a stuck report in exactly 5 lines:
1. Goal: what you were trying to do.
2. Command: the exact command you ran.
3. Result: the exact error or wrong output (shortest useful part).
4. Tried: what you tried, in order.
5. Theory: what you think is wrong.
Also give the branch name and the last commit hash. Do not try anything else.
```

## 7. Spec request (you send this to Claude, in chat)

```
Write the feature file for <feature, for example F3 Currencies and accounts> in the ledger service.

Use the template in services/ledger/docs/features/_template.md and the style of F02-idempotency.md: goal, out of scope, reads first, decisions already made, exact formats (exact SQL, JSON, headers, error codes), exact files, "Done when" rules that are each testable, a test plan with a sabotage for every rule, edge cases, a fail-closed checklist, and complex parts with the algorithm and cases written out.

Check it against: docs/invariants.md, docs/rfc-001.md, the decision records, and docs/versions.md "Not in v1". Tell me if the RFC or invariants need a change first.
Ask me every open product question in one list before you write it.
```

(Attach or paste: `invariants.md`, `rfc-001.md`, `roadmap.md`, `patterns.md`, the previous feature file with its Metrics, and `lessons-from-f1.md`.)

## 8. Complex-part review (you send this to Claude, in chat)

```
Review the complex parts of <feature file> against its spec.

Attached: the feature file, the diff as a file (git --no-pager diff main...HEAD -- services/ledger/src services/ledger/migrations services/ledger/test > ~/Desktop/f.diff), and the sabotage report from prompt 3.
Check: does the code follow the algorithm in the spec exactly? Which test would catch each way it can go wrong? Which sabotage results look weak? What is missing from the tests? Does anything break an invariant? Rank findings by risk, at most 7, with the exact fix for each.
```

## 9. Escalation (you send this to Claude, in chat)

```
The executor is stuck on <feature>. Here is its stuck report:
<paste the 5 lines, the branch name, and the last commit hash>

Attached: the feature file, the failing test output, and the relevant files.
Find the cause. Give me the exact fix, or tell me what in the spec must change. If the spec was wrong, give me the corrected spec text.
```

## 10. Self-review only (use when you want to rerun step B of prompt 3 alone)

```
Run the self-review for <feature file>. Go through docs/process/review-checklist.md against git diff main...HEAD. Report each violated item with the file and line, then fix them test-first. Do not add features.
```

## 11. Retro (after the merge, in the CLI)

```
Retro for <feature file>. Answer in at most 10 bullets. Do not change any file.
1. What in the spec or the repository files was unclear, missing, or slowed you down?
2. What did you have to guess?
3. Which instruction was hard to follow, or in conflict with another?
4. Which step took the most effort, and why?
5. What single change to the spec template or the prompts would have saved the most time?
6. Which pattern or helper was missing that you wrote from scratch?
```
