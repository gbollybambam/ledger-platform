# DEC-0015: Currencies come from an allow-list table

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Decision

A `currencies` table holds the allowed ISO 4217 codes and their minor-unit exponent. An account's currency must exist in it (foreign key). A migration seeds it with NGN, USD, EUR, GBP, GHS, KES, and ZAR (all exponent 2). Adding a currency is a reviewed migration.

The ledger works only in integer minor units. The exponent is stored so clients and reports can display amounts correctly.

## Rejected options

- Any 3-letter code. A typo would create a new, empty currency silently.
- A list in code. A table can be checked by the database, and the history is in migrations.

## Why

A wrong currency code on real money is a serious bug. The database should refuse it.

## Trade-offs and risks

A new currency needs a migration and a deploy. That is intended.
