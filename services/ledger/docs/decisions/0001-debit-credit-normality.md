# DEC-0001: Use debit/credit normality, not signed amounts

- Date: 2026-10-27
- Status: accepted

## Decision

Every account has a normal balance: `debit` or `credit`. Every entry has a direction (`debit` or `credit`) and a positive amount. The account type decides how an entry changes a balance.

## Rejected options

- One signed number per entry (positive for credit, negative for debit).
- One signed balance per account with no normality.

## Why

With signed numbers, two accounts can't both go up in one transaction. A wallet deposit raises cash and raises the user's wallet. Normality handles this cleanly. It also matches how real accounting works.

## Trade-offs and risks

I must learn debit and credit well. Mistakes in account type will give wrong balances. Tests must cover each account type.
