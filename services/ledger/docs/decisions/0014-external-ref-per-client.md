# DEC-0014: `external_ref` is unique per client

- Date: 2026-10-27
- Status: accepted (new in the platform pivot)

## Decision

A transaction may carry an `external_ref`: an opaque string chosen by the client (for example `provider:payment:pay_123`). The pair `(client_id, external_ref)` is unique. Posting a second transaction with the same pair is rejected with 409 `external_ref_conflict`, and the response names the existing transaction.

The ledger never parses an `external_ref`.

## Rejected options

- No reference field. Other services could not match their records to ledger transactions.
- Globally unique references. Two services could collide by accident.
- Relying on the idempotency key for this. A key lives 24 hours or more, and it identifies a **request**. A reference identifies the **business event**, and it lives as long as the transaction.

## Why

It is a second line of defense against duplicates, and it is the join key for reconciliation.

## Trade-offs and risks

Clients must choose stable, unique references. The ledger cannot check that they mean the right thing.
