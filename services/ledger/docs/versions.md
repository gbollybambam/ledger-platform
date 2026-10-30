# Version plan (ledger)

This file says what gets built, and when. It is the one place for later ideas.

**Only v1.0.0 is a promise.** Everything after it is a plan. It can change.
`v1.0.0` means "built and tested". It does **not** mean "safe for real money". That has its own gate: `docs/production-readiness.md` at the repository root.

Source tags: **[MT]** Modern Treasury. **[TB]** TigerBeetle. **[Own]** my own idea.
The details of each idea are in `docs/research/notes.md`.

Only the ledger is planned here. The gateway and reconciliation get their own plans when they start.

## Map

| Version | Theme | Status |
| ------- | ----- | ------ |
| ledger/v0.1.0 | Skeleton (Phase 2) | built, awaiting CI |
| ledger/v0.2.0 | Ledger core (F1 to F7) | locked |
| ledger/v0.3.0 | Query API (F8) | locked |
| **ledger/v1.0.0** | **Hardened, documented release (F9, F10)** | **locked** |
| v1.1 | Depth and launch-gate items | idea |
| v1.2 | Integration kit | idea |
| v2.0 | History and time | idea |
| v2.1 | Multi-currency | idea |
| v3.0 | Aggregation and reporting | idea |
| v4.0 | Scale | idea |
| v5+ | Explorations | maybe never |

## v1.0.0 (LOCKED)

- What is in: the must-haves in `docs/prd.md`.
- The order of work: `docs/roadmap.md`.
- How it works: `docs/rfc-001.md`.

**Not in v1.** These stay out, even if they look easy:

- Pending, posted, and available balances
- Currency conversion
- Backdating (`effective_at`) and as-of balances
- Historical balance caches
- Account categories, sub-accounts, statements, rich search
- A write queue, batching, sharding
- Redis or any cache layer
- An event feed or outbox
- Rate limiting, an audit log table, metrics, tracing (see v1.1: these are **launch-gate items**)
- User login, multi-tenant isolation between clients, a UI
- Anything about providers, webhooks, payouts, or statements (other services)

**Rule:** an idea moves into v1 only with a new decision entry that also says what leaves v1.

## v1.1: Depth and launch-gate items

Theme: close the gaps that block real money, and make the core richer without changing its safety rules.

Launch-gate items (needed before real money, see `docs/production-readiness.md`):

- Rate limiting and lockout for failed authentication. [Own]
- Audit log: who changed what, and when, in an append-only table. [MT]
- Metrics (latency, errors, lock waits, pool use) and trace propagation (W3C `traceparent`, OpenTelemetry). [Own]
- Mutation testing on the posting code. [Own]
- API key rotation with two active keys per client during a switch. [Own]

Other v1.1 items:

- Pending, posted, and archived transactions. Three balances: posted, pending, available. Only pending entries can be replaced. [MT] [TB]
- Transactional outbox and an event feed for other services. [Own]
- Idempotency cleanup job with a retention setting. [MT]
- Scheduled `verify` with an alert hook. [MT]
- Account freeze and close flags. [TB]
- Rate and size limits on request bodies. [Own]

Why later: pending adds a mutable state. v1 proves the immutable core first.

## v1.2: Integration kit

Theme: make it easy and safe for other services to use.

- Generated clients (PHP, Python) from the OpenAPI file. [Own]
- Consumer contract tests (for example Pact) run in the ledger's CI. [Own]
- Shared money test vectors for all languages. [Own]
- A streaming export for large windows. [Own]
- Read-replica support for the query API. [Own]

## v2.0: History and time

Theme: answer "what was the balance then?"

- `effective_at` backdating. All entries on a transaction share it. [MT]
- `account_version` stored on entries, for consistent balance and entry reads. [MT]
- As-of balance queries. [MT]
- Transaction versions (needed once pending exists). [MT]
- Historical caches: end-of-day anchors first, then resulting-balance. [MT]
- Async cache updates through a queue, with read-time application of queued entries. [MT]
- Drift monitoring for the history caches. [MT]

## v2.1: Multi-currency

- Currency conversion with the four-account pattern. [MT]
- Balancing per currency inside one transaction. [MT]
- Exchange rate source, with the rate saved on the transaction. [Own]
- Separate ledgers per currency or asset type. [TB]

## v3.0: Aggregation and reporting

- Account categories with graph-based roll-ups, and parent-child accounts. [MT]
- Sub-accounts that share a balance. [MT]
- Statements per account and date range. [MT]
- Flexible search: filters, fuzzy match, custom sorting. [MT]
- Index tuning by query shape, and table partitioning. [MT]
- Reports for system accounts: trial balance, balance sheet, income statement. [Own]

## v4.0: Scale

- Write-ahead queue for ledger writes. Durable and idempotent. [MT]
- Batching. [TB]
- Recording mode and authorizing mode, chosen per entry. [MT]
- A plan for hot accounts. [MT]
- Sharding across databases, with cross-shard atomicity. [MT]
- Single-writer design experiment. [TB]
- A benchmark report across versions. Optional: TigerBeetle as a second storage engine behind an interface, to compare. [TB]

## v5+: Explorations (maybe never)

- A lending ledger with an amortization schedule. [MT]
- Fault-injection and deterministic simulation testing. [Own]
- A formal model of the posting protocol (TLA+ or Alloy). [Own]
- Chaos tests: kill the database mid-write, cut the network. [Own]
- Multi-tenant ledgers. [Own]

## Ideas not placed yet

Add new ideas here. Then place them in a version.

- (none yet)
