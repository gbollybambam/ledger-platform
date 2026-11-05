# Lessons from F1

What went wrong in F1, why it cost time, and the rule that stops it from happening again. Add a row after every feature (prompt 11 helps).

| # | What happened | Why it cost time | Rule now |
| - | ------------- | ---------------- | -------- |
| 1 | The executor asked two questions in two rounds (key prefix, tool output format) | A round trip each, and the answers were things the spec should have said | The spec has "Decisions already made" and "Exact formats". The executor asks **all** questions in **one** batch, only about things not listed there |
| 2 | Authentication protected a list of paths. Anything not on the list was open | Found only in review, then re-designed | **Default deny.** Security controls start closed. The allowed things are a short, declared list. Tests loop over every route |
| 3 | The log-redaction test passed even without redaction | A weak test gives false safety, and was found only in review | **Sabotage check.** For every rule, break the code on purpose and show the test fails |
| 4 | The "large body" test sent less than the limit | The test did not test the limit | A test for a limit must go past it. A test for a boundary tests both sides |
| 5 | Only the 403 case was tested for scopes | A bug that denies everything would pass | Every rule has a **positive** and a **negative** test |
| 6 | Tests shared fixed IDs and restored state at the end of the test | One failure made later tests fail for the wrong reason | Unique fixtures per test. Cleanup in `try/finally`. Clean up at the start too |
| 7 | A Windows path was pasted into `package.json` | A broken script nobody noticed | Read `git diff` before every commit. Scripts have a test |
| 8 | Docs still named a deleted function. The RFC error table was behind the code | The next reader (human or LLM) is misled | **Docs sync** in the done check: search the docs for every name that was removed or renamed |
| 9 | `/health/ready` returned a different error shape | A contract with an exception is not a contract | Every error uses `errorBody()`. A test checks the shape |
| 10 | CLI tests started `npm` for every case. The suite took about 1 minute | Slow tests get skipped | Test logic in-process. Keep one or two real smoke tests |
| 11 | `npm run` prints a banner, which can break exact-output tests | Works on one machine, fails on another | Run scripts with `--silent` in tests |
| 12 | Review found 13 fix-now items across two reviews | Most were classes of mistake (rows 2 to 9), not one-off bugs | Run the review checklist **yourself** (prompt 10) before asking for a review |

| 13 | F2: tests read the SQL file text instead of using the database, so their sabotage was circular | The database guards were unproven | A guard is tested by trying to break it as the right role. Never test a migration by reading its text |
| 14 | F2: the "effect" was an in-memory counter | "Exactly once" and "atomic" were not proven | Use a real effect table. Count rows |
| 15 | F2: `toBeDefined()` on a `count(*)` result | It is always true | Assert exact values |
| 16 | F2: one full check after every small step, long output | About 150 credits and a day for one feature | Targeted tests while building. Full check before review and PR. Capped output. Two short sessions |

## What to measure

Record these in each feature file (see the "Metrics" section of the template):

- Questions the executor asked.
- Fix-now findings in review pass 1.
- Rough minutes: spec check, tests first, build, review fixes.

A good result for a feature with a good spec is: 0 to 1 questions, 0 to 3 fix-now findings, and one review pass.
