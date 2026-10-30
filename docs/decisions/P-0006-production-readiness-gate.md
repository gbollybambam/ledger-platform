# P-0006: The launch gate is separate from version tags

- Date: 2026-10-27
- Status: accepted

## Decision

A version tag such as `ledger/v1.0.0` means "the planned features are built and tested". It does **not** mean "safe for real money". Real money may flow only after every item in [production-readiness.md](../production-readiness.md) is done, evidenced, and signed off.

## Rejected options

- Treating `v1.0.0` as the launch. It mixes feature work with operations, security, and legal work.

## Why

Software that is correct can still lose money through weak operations, leaked keys, missing backups, or missing licenses.

## Trade-offs and risks

More work after the code is done. That work is real and cannot be skipped.
