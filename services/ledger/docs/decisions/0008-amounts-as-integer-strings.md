# DEC-0008: Amounts in the API are integer strings in minor units

- Date: 2026-10-27
- Status: accepted

## Decision

The API accepts and returns amounts as strings of digits, such as `"150000"`. They are in minor units (for example kobo or cents). The database uses `bigint`. The API rejects decimals, negatives, empty strings, and non-digits.

## Rejected options

- JSON numbers. Large values can lose precision in some languages.
- Decimal strings such as `"1500.00"`. They bring rounding and format problems.

## Why

Integers cannot round. Strings cannot lose precision in transit.

## Trade-offs and risks

Slightly less friendly for API users. Clients must know the minor unit of each currency.
