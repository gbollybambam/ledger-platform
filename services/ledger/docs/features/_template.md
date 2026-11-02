# Feature: <id> <name>
Status: todo | in progress | done

## Goal
<One or two sentences. What can be done after this feature that could not be done before?>

## Out of scope
<Explicit exclusions. Anything on this list must not be built.>

## Reads first
<Ordered list of files and sections the executor must read.>

## Decisions already made (do not ask)
<Numbered. Every choice that could otherwise be a question: names, formats, limits, error codes, status codes, file paths, SQL. The executor asks only about things NOT listed here.>

## Exact formats
<Exact SQL, JSON bodies, headers, error codes, command output. Copy-paste ready.>

## Files
<Exact paths to create or change, one line each.>

## Done when
- [ ] All rules in docs/invariants.md still hold
- [ ] <Rule 1, testable> (test: <name>)
- [ ] <Rule 2, testable> (test: <name>)

## Test plan
| Rule | Test name | Sabotage that must make it fail |
| ---- | --------- | ------------------------------- |
| <rule> | <test name> | <one-line change to the production code that must turn this test red> |

## Edge cases that must be tested
<Boundaries (both sides, and past the limit), bad input, concurrency, failure in the middle, repeat, order.>

## Fail-closed checklist
<Which new controls default to deny? Which test loops over all routes or all cases?>

## Complex parts (extra oversight)
<The algorithm, step by step, and the test cases that prove it. The planner reviews the diff of these files before the feature is done.>

## Docs to update
<Files that must change in the same PR: OpenAPI, RFC, patterns, CHANGELOG, roadmap.>

## Metrics
- Questions the executor asked:
- Fix-now findings in review pass 1:
- Fix-now findings in review pass 2:
- Rough minutes: spec check / tests first / build / review fixes:

## Review log
- Pass 1: findings, fixed, moved to backlog
- Pass 2 (only if pass 1 had fix-now items): findings, fixed, moved to backlog
