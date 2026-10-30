# Prompts for each step

Copy a prompt, fill in the values in `<angle brackets>`, and paste it into the CLI session. All paths are from the repository root.

Launch the CLI from the **repository root** (so the root `AGENTS.md` is found). Commands for the ledger run from `services/ledger`.

## 1. Load the context (start of every session)

```
You are the executor for the ledger service in this repository. You write the code and the tests. You do not decide scope.

Read these files completely before you do anything else:
1. AGENTS.md
2. services/ledger/AGENTS.md
3. services/ledger/docs/invariants.md
4. services/ledger/docs/rfc-001.md
5. <feature file, for example services/ledger/docs/features/F01-clients-auth.md>
6. docs/process/feature-loop.md
7. Every decision record that the feature file lists under "Reads first".

Then answer, and do NOT write code yet:
1. Summarize the feature in 8 lines or fewer.
2. Which invariants (INV-xx) does it touch?
3. List the files you plan to create or change.
4. List the complex parts and how you will keep them safe.
5. List anything in the spec that is unclear or conflicts with another file. Ask me. Do not guess.
6. List every instruction file you loaded.
```

## 2. Tests first

```
Write the failing tests for every "Done when" item in <feature file>.

Rules:
- One or more tests per rule. Name each test so I can find its rule.
- Use the real database. Do not mock it.
- Do not write any implementation, except the smallest empty stubs that are needed to compile.
- Run the tests. Show me each failing, and say why it fails. A test that fails for the wrong reason (a typo, a missing import) is not done.
- Do not weaken a rule to make it easier to test. If a rule cannot be tested as written, stop and tell me.
- Commit the tests alone, using Conventional Commits from CONTRIBUTING.md.
```

## 3. Build

```
Now implement <feature file>, one "Done when" rule at a time.

Rules:
- Make one rule pass, run the full check, then commit. Small commits. Conventional Commits.
- Full check: cd services/ledger && npm run lint && npm run format:check && npm run typecheck && npm run openapi:lint && npm test && npm run build
- Never change, skip, or delete a test to make it pass. If you think a test is wrong, stop, explain, and wait for me.
- Do not add anything the feature file does not ask for.
- Do not add a dependency without asking me first.
- Change the OpenAPI file in the same commit as the code.
- Follow the money rules and database rules in services/ledger/AGENTS.md.
- If the same check fails 3 times, or you make no progress for 30 minutes, stop and write a stuck report (see the template in docs/process/kickoff-prompts.md, prompt 6).
When all rules pass, say so and list the commits.
```

## 4. Review (pass 1 and pass 2)

```
Review this code only against the rules below.

Rules:
<paste services/ledger/docs/invariants.md, then the "Done when" list of the feature file>

Constraints:
- Do not suggest new features.
- List at most 5 issues, ranked by risk.
- For each issue, state what breaks and provide the exact fix.
- If nothing is critical, state "No critical issues."

Review the diff with: git diff main...HEAD
```

After the review: sort each finding with the matrix in `docs/process/feature-loop.md`. Fix the "fix now" ones, put the rest in `services/ledger/BACKLOG.md`, and write the result in the feature file under "Review log". For pass 2, start a new session or say "This is pass 2. Findings from pass 1 are fixed or in the backlog."

## 5. Done check

```
Do the done check for <feature file>.

1. Go through every "Done when" item. For each one, name the test that proves it, and say whether it passes.
2. Run the full check and show the result.
3. Check that no test was weakened, skipped, or deleted (git diff main...HEAD -- test).
4. Check that openapi/ledger.v1.yaml matches the code.
5. Update the feature file: tick the boxes that are proven, and set Status to "done" only if all are ticked.
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
Write the feature file for <feature, for example F2 Currencies and accounts> in the ledger service.

Use the template in services/ledger/docs/features/_template.md and the style of F01-clients-auth.md. Include: goal, out of scope, "Reads first", expected changes, "Done when" rules that are each testable, and complex parts with the algorithm and test cases written out.

Check it against: docs/invariants.md, docs/rfc-001.md, the decision records, and docs/versions.md "Not in v1".
Tell me if the RFC or invariants need a change first.
```

(Attach or paste: `services/ledger/docs/invariants.md`, `services/ledger/docs/rfc-001.md`, `services/ledger/docs/roadmap.md`, and the finished feature file for the previous feature.)

## 8. Complex-part review (you send this to Claude, in chat)

```
Review the complex parts of <feature file> against its spec.

Attached: the feature file, the diff of the code, and the test names.
Check: does the code follow the algorithm in the spec exactly? Which test would catch each way it can go wrong? What is missing from the tests? Does anything break an invariant? Rank findings by risk, at most 7, with the exact fix for each.
```

## 9. Escalation (you send this to Claude, in chat)

```
The executor is stuck on <feature>. Here is its stuck report:
<paste the 5 lines, the branch name, and the last commit hash>

Attached: the feature file, the failing test output, and the relevant files.
Find the cause. Give me the exact fix, or tell me what in the spec must change. If the spec was wrong, give me the corrected spec text.
```
