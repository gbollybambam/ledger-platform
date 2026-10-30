# DEC-0005: Store idempotency keys in Postgres, in the same transaction as the money write

- Date: 2026-10-27
- Status: accepted

## Decision

Every POST request needs an `Idempotency-Key` header. Keys are scoped to the calling client (see DEC-0013). The key goes in an `idempotency_keys` table with a unique `(client_id, key)`. The key row, the ledger writes, and the stored response commit together. Same key and same request returns the stored response. Same key and a different request returns 409. Keys are kept for at least 24 hours. Only committed results are stored. A failed request is not stored.

## Rejected options

- Redis for keys. It can't commit atomically with the ledger write, and it adds another moving part.
- App memory. It is lost on restart and doesn't work with many instances.

## Why

A concurrent duplicate blocks on the unique index until the first request commits. Then it sees the key and replays the response. No "in progress" state is needed.

## Trade-offs and risks

Failed requests are re-run on retry. For example, a request that failed for low funds can succeed after a top-up. This is intended. Clients must not retry a money request after the retention window.
