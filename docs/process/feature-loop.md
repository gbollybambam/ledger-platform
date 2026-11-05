# The feature loop (version 3: leaner)

Roles: **Owner** runs the loop and merges. **Executor** (Copilot CLI) writes all code and tests. **Planner** (Claude) writes specs and reviews every feature. **Second reviewer** (Gemini, in chat) reviews with fresh eyes.

Prompts: [kickoff-prompts.md](kickoff-prompts.md). Past mistakes: [lessons-from-f1.md](lessons-from-f1.md). Checklist: [review-checklist.md](review-checklist.md).

## Cost rules (they changed in version 3)

1. **Two short sessions** per feature. Session A: prompts 1 and 2 (read, then tests). Session B: prompt 3 (build and prove). A fresh session drops the old logs, so each turn costs less.
2. **Targeted tests while building:** `npx vitest run test/<file>` and `npm run typecheck`. The **full check runs twice**: before review and before the PR. CI runs everything again.
3. **Cap output:** `| tail -40`, `git diff --stat`, tables, no long explanations.
4. **Sabotage only for rows marked S** in the test plan (security, money, integrity). Other rows get a "would this pass without the feature?" check.
5. **Measure:** write the AIC counter in the feature file after each step.

## The steps

1. **Pick** the next `todo` feature in the roadmap.
2. **Spec** from the planner (prompt 7). Spec check (5 min): every choice decided? Every rule testable? Rows marked S?
3. **Session A, prompt 1.** One batch of questions, only about undecided things. Answer once.
4. **Session A, prompt 2.** Tests first. **Gate:** test names match the plan; every test fails for the right reason (stubs throw `not implemented`).
5. **Session B, prompt 3.** Build one rule at a time with targeted tests. Then the sabotage rows (S only) and the self-review. **Gate:** read the S table. Each row must show red.
6. **Full check**, then the diff files. **Gemini review** (prompt 4). Sort findings with the matrix. Fix "fix now" items.
7. **Planner review** (prompt 8, every feature): send `src` and `migrations` diff, test names, and the S table. For simple features I answer shortly.
8. **Done check** (prompt 5), full check, PR, green CI, squash merge.
9. **Retro** (prompt 11, 5 bullets). Add rows to the lessons file if something new happened.

A second review pass happens only if the first had "fix now" items.

## Finding classification

| Finding | Action |
| ------- | ------ |
| Breaks money or data integrity | **Fix now** |
| Breaks a "Done when" rule or a v1 requirement | **Fix now** |
| A test that would pass without the feature | **Fix now** |
| Anything else | Backlog |

## The stuck rule

Same check failing after 3 real attempts, or 30 minutes without progress: stop, write 5 lines (prompt 6), send the planner prompt 9.

## Definition of done

- Every "Done when" box ticked, each with a named test. S rows proven by sabotage.
- Full check passes. CI green. No test weakened or deleted.
- OpenAPI matches the code. Docs synced (no removed name still mentioned).
- Feature file, roadmap, and CHANGELOG updated.

## Session hygiene

- One feature per pair of sessions. Fresh session if the model repeats itself.
- Never paste file paths or secrets into a running session. Read `git diff --stat` before every commit.

## Targets

0 to 1 questions. 0 to 3 fix-now findings. One review pass. 0 weak tests found in review. Credits per feature: measure now, then set a target after F3.
