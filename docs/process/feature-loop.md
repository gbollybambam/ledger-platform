# The feature loop

The same loop for every feature, in every service. The executor is the CLI model (see [P-0007](../decisions/P-0007-ai-assisted-execution.md)).

Roles: **Owner** (you) runs the loop and merges. **Executor** (Copilot CLI, GPT 5.6 Luna) writes 100% of the code, tests, and migrations. **Planner** (Claude) writes specs, reviews complex parts, and unblocks.

Prompts for each step are in [kickoff-prompts.md](kickoff-prompts.md).

## The 8 steps

1. **Pick the feature.** Take the next `todo` row in the service's `docs/roadmap.md`. Never skip ahead.
2. **Set up the session.** Make a branch (`feat/ledger-<name>`). Start a **fresh** CLI session. Point it at: the repository `AGENTS.md`, the service `AGENTS.md`, `docs/invariants.md`, and the feature file. (Prompt 1.)
3. **Have the feature file.** For the first feature it already exists. For later ones, the planner writes it (prompt 7, "spec request") before step 2. The executor does not invent specs. A feature file has a goal, an exclusion list, "done when" rules, and the complex parts.
4. **Tests first.** The executor writes failing tests for every "done when" rule, runs them, and shows each failing for the right reason. No implementation yet. (Prompt 2.)
5. **Build in small steps.** The executor implements, one rule at a time, in small commits that follow `CONTRIBUTING.md`. After each step it runs the full check. (Prompt 3.) You only step in if it is blocked (the stuck rule).
6. **Review, at most two passes.** Use the review prompt against `docs/invariants.md` and the feature's "done when" rules. Sort every finding with the matrix below. Log them in the feature file. (Prompt 4.) For complex parts, the planner also reviews (prompt 8).
7. **Done check.** Every box ticked. CI green. No test weakened. (Prompt 5.)
8. **Merge and log.** Open a PR. Squash merge. Set the feature to `done` in the roadmap. Add a CHANGELOG line. Add a decision record if a major choice was made.

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

## Finding classification matrix

| Finding | Action |
| ------- | ------ |
| Breaks money or data integrity | **Fix now** |
| Breaks a v1 functional requirement | **Fix now** |
| Everything else (style, minor refactors) | Log in the service's `BACKLOG.md` and move on |

Two passes at most. After pass 2, anything left that is not "fix now" goes to the backlog. The review does not repeat until it is quiet.

## The stuck rule

The executor is **stuck** if the same check still fails after 3 real attempts, or there is no progress for 30 minutes.

When stuck:

1. Stop. Do not loop alone.
2. Write the problem in 5 lines (what you wanted, what you ran, what happened, what you tried, what you think). Use the template in prompt 6.
3. Send it to the planner (prompt 9). The planner finds the cause and gives the exact fix, or changes the spec.

## Complex parts

Each feature file lists its complex parts (locking, multi-account writes, security-sensitive code, anything that is hard to see by reading). For these:

1. Before the executor writes code, the planner writes the algorithm and the test cases (the spec in the feature file).
2. The executor implements exactly that.
3. After it works, the planner reviews the diff (prompt 8) before the feature is called done.

## Definition of done

- Every "done when" box is ticked, each with a test that fails when the rule is broken.
- All invariants still hold.
- `npm run lint && npm run format:check && npm run typecheck && npm run openapi:lint && npm test && npm run build` passes.
- CI is green on the PR.
- No test was weakened, skipped, or deleted without a written reason that the owner approved.
- The OpenAPI file matches the code.
- The feature file, roadmap, and CHANGELOG are updated.

## Session hygiene

- One feature per session. Start fresh for the next.
- Keep sessions short. If the model starts to repeat itself or forget rules, end the session and start again with prompt 1.
- Do not paste secrets into a session.
- Run destructive commands only against throwaway databases.
- The executor commits. You review the PR diff, tests first.
