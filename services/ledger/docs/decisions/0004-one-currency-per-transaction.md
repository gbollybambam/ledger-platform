# DEC-0004: One currency per transaction in v1

- Date: 2026-10-27
- Status: accepted

## Decision

Every account has a currency. Every entry copies the account currency. All entries in one transaction must share one currency. Currency conversion is not in v1.

## Rejected options

- Full multi-currency with conversion in v1.
- A single global currency with no currency field. It would block v2.1.

## Why

Conversion is hard. The correct design needs four accounts and balancing per currency. Storing currency now keeps the data model ready.

## Trade-offs and risks

Users with two currencies need two wallets. The test suite uses two currencies (for example NGN and USD) to prove they never mix.
