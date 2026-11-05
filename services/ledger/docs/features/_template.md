# Feature: <id> <name>
Status: todo | in progress | done

## Goal
<One or two sentences.>

## Out of scope
<Explicit exclusions.>

## Reads first
<Only the files and sections needed. The spec should be self-contained.>

## Decisions already made (do not ask)
<Numbered. Every choice that could be a question: names, formats, limits, codes, paths, SQL.>

## Exact formats
<Exact SQL, JSON, headers, error codes, output.>

## Files
<Exact paths to create or change.>

## Done when
- [ ] All rules in docs/invariants.md still hold
- [ ] <Rule, testable> (rows: Rn)

## Test plan
S = sabotage required (security, money, integrity). Rows without S: check that the test would fail without the feature.

| Row | Rule | Test name | S | Sabotage (one-line change that must turn the test red) |
| --- | ---- | --------- | - | ------------------------------------------------------- |

## Edge cases that must be tested
<Boundaries on both sides and past the limit, bad input, concurrency, failure in the middle, repeat, order.>

## Fail-closed checklist
<Which controls default to deny? Which test loops over all cases?>

## Complex parts
<The algorithm and cases, written out.>
Planner review: yes (src + migrations diff, test names, S-sabotage table).

## Docs to update
<Files the executor changes in the same PR. The planner owns RFC, invariants, and decisions.>

## Metrics (write the AIC counter after each step)
| Step | AIC used |
| ---- | -------- |
| Prompt 1 | |
| Prompt 2 (tests) | |
| Prompt 3 (build + prove) | |
| Review fixes | |
| Done check | |
| Total | |

Questions asked: | Fix-now findings: | Minutes in total:

## Review log
- Gemini pass 1:
- Planner review:
- Pass 2 (only if there were fix-now items):
