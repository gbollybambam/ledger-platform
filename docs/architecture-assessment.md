# Architecture assessment: three services, three languages

Status: assessment. It feeds [P-0002](decisions/P-0002-independent-services-polyglot.md).
Scope: the whole platform. Only the ledger is being built now.

## Verdict

1. **Three separate services with their own databases: good, if we keep the discipline.** It gives clear ownership, failure isolation, and a design that can grow.
2. **Three languages: the riskiest part, not the best part.** It is a real cost for one developer, and a bigger one when AI writes 100% of the code. Every language is one more thing to review, patch, test, build, and secure.
3. **The decision is reversible if we decide late.** The ledger is fixed as TypeScript. The gateway and reconciliation stacks are decided when each one starts, using the test in "Conditions" below. Nothing built now depends on those choices.
4. **"Production with real money" is a bigger goal than "a well-built service".** The code can be production-grade. Launching with real money also needs security review, operations, and legal steps. See [production-readiness.md](production-readiness.md).

I do not recommend stopping. I recommend the conditions at the end.

## What this decision costs

| Area | One service, one language | Three services, three languages |
| ---- | ------------------------- | ------------------------------- |
| Deployments | 1 | 3 |
| Runtimes and package managers | 1 | 3 (Node, PHP, Python) |
| CI pipelines and Docker images | 1 | 3 |
| Dependency and security updates | 1 stream | 3 streams |
| A payout (ledger write + provider call) | One database transaction | A distributed workflow with retries |
| Debugging one request | One log | Three logs joined by a request ID |
| Code you must be able to review | 1 language | 3 languages |

## Pros (real ones)

- **Clear boundaries.** The ledger can't be bent by provider quirks. It never learns what a provider is.
- **Independent failure and scaling.** A slow statement import can't slow down money writes.
- **Independent release.** The ledger can ship a fix without touching the gateway.
- **Right-sized security.** Only the gateway sees provider secrets. Only the ledger has write access to money tables.
- **Portfolio breadth.** It shows range, if it works.

## Cons (raw)

- **Distribution arrives on day one.** Calls between services fail, time out, and repeat. Every flow must be safe under retry. This is the biggest cost, and it is independent of language.
- **Cross-service atomicity is gone.** The old design saved a payout row and its ledger entries in one transaction. That is impossible now. We replace it with idempotent calls and a state machine in the gateway.
- **Contract drift.** Three codebases can disagree about the same JSON.
- **Money handling differs per language.** JSON big numbers, PHP integer limits, Pandas floats. See "Blind spots".
- **Review burden.** If you can read TypeScript well but not PHP or Python, you cannot judge AI-written code there. Tests and rules must replace your reading.
- **Slower iteration.** Every cross-cutting change touches several services and a contract.
- **Operations multiply.** More images, more alarms, more secrets, more things to patch.

## Does each tool fit its job?

| Service | Tool | Fits because | Weak spot | Fit |
| ------- | ---- | ------------ | --------- | --- |
| Ledger | Node.js + TypeScript + PostgreSQL | The work is waiting on the database, not on the CPU. Types help. The ecosystem is mature. | Single-threaded runtime. No built-in big-integer JSON. Both are handled (row locks and integer strings). | Good |
| Gateway | Laravel (PHP) | Queues, retries, scheduled jobs, webhook handling, and provider SDKs are strong. It matches your experience. | A third runtime. Money math needs `bcmath` or a money library. Weaker typing unless PHPStan is strict. | Good, with care |
| Reconciliation | Python (FastAPI + Pandas) | Python is the best of the three for parsing statements and wrangling data. | Recon is a batch job more than a web service, so FastAPI is a thin benefit. **Pandas defaults to floating point, which is dangerous for money.** | Language: good. Pandas and FastAPI: questionable |

On Pandas: if it is used at all, money columns must be integers (`int64`) or `Decimal`, never floats. For the planned scale (thousands of rows a day), plain Python with hash maps or SQL is simpler and safer. Decide when reconciliation starts.

## Alternatives we could have used

| Option | What it is | Why it could be better | Why we are not choosing it now | Trade-off we accept |
| ------ | ---------- | ---------------------- | ------------------------------ | ------------------- |
| **A. Modular monolith** | One TypeScript app with three modules and one database | One transaction across ledger and payout. One deploy. Fastest path to a correct system. This is the usual best default for one developer. | You want separate, isolated services. | More moving parts and more failure modes. |
| **B. Three services, one language (TypeScript)** | Same split, one toolchain | Shared types and tooling. One thing to review and patch. | You want Laravel and Python for their strengths. | Three toolchains and a larger review burden. |
| **C. Ledger in Go, Kotlin/Java, or Rust** | A different core language | Go: simple concurrency, small binaries. JVM: mature money types. Rust: strong safety. | The ledger's limit is the database, so the gain is small. TypeScript is already built and tested. | A runtime with weaker native money safety. We add lint rules and integer strings. |
| **D. Event-driven backbone** | Kafka or NATS with outbox, plus event sourcing | Decoupling, replay, many consumers. | A lot of infrastructure and skill for a first version. | Clients poll a read API for now. An outbox is planned for v1.1. |
| **E. Workflow engine (for example Temporal)** | Durable workflows for payout steps | Retries, timers, and state are handled for you. | New infrastructure. Decide when the gateway starts. | Hand-written state machines in the gateway. |
| **F. Adopt an existing ledger** | For example TigerBeetle, Formance Ledger, or a hosted ledger product | Years of testing. Less risk to money. | You want to build it. | We own all the correctness work. See "Build or adopt". |

## Build or adopt?

For **real customer money**, adopting a proven ledger is the usual industry default for a new product. A homemade ledger is the highest-risk part to get wrong. Building it is a good choice when the goal is learning and a portfolio-grade core, and when real money only flows after independent review. You can't have both "built from scratch" and "no review needed". The plan in this repo is the first one, with the launch gate in [production-readiness.md](production-readiness.md).

## Blind spots, and the rule we adopt for each

| # | Risk | Why it bites | Our rule |
| - | ---- | ------------ | -------- |
| 1 | **No cross-service transaction** | A payout needs a ledger write and a provider call. Either can fail or time out. | The ledger commits first, with an idempotency key. The caller retries with the same key. "Unknown outcome" is a normal state, not an error. Pick an outbox or a workflow engine when the gateway starts. |
| 2 | **At-least-once delivery** | Webhooks and retries mean duplicates. Exactly-once does not exist. | Idempotency keys on every POST (INV-07). `external_ref` is unique per client (INV-13). |
| 3 | **The ledger is on the critical path** | If it is slow, every payment is slow. | The ledger calls nobody (INV-10), so there are no cycles. Clients use timeouts, backoff with jitter, and circuit breakers. |
| 4 | **Contract drift across languages** | A field changes in one place only. | OpenAPI is the source of truth. A test checks that the spec and the routes match (INV-16). Changes inside `/v1` are additive. Generated clients and consumer contract tests come when the second service starts. |
| 5 | **Money across languages** | JS loses precision above 2^53. PHP turns huge ints into floats on decode. Pandas defaults to floats. | Amounts are integer strings (DEC-0008). Lint bans float math in the ledger. Shared money test vectors are added when the second service starts. |
| 6 | **Observability** | You cannot debug one payment across three logs. | A request ID on every response now. Propagate W3C `traceparent` and add OpenTelemetry before launch. |
| 7 | **Event queue timing** | A queue too early adds cost. Too late forces rework. | No queue in v1. Clients read the ledger with a safe, paged API (DEC-0019). An outbox is planned for v1.1. |
| 8 | **Shared database temptation** | Reading another service's tables is fast and breaks isolation forever. | One database per service. No cross-service SQL (P-0003). |
| 9 | **Service-to-service auth** | An open internal API is a way to steal money. | Per-client API keys with scopes, hashed at rest (INV-11). TLS in every environment. Rotation procedure before launch. |
| 10 | **DevOps times three** | Three images, three CI lanes, three patch streams. | The same script names and Docker rules in every service. CI per service (P-0005). Dependabot per ecosystem. |
| 11 | **Review capacity** | AI writes 100% of the code and you cannot read all of it. | Tests written from the spec first. Rules enforced by the database, not only by code. Independent review by another model and a human engineer before real money (P-0007). |
| 12 | **Regulation and security** | Holding customer funds and card data is regulated. | Do not touch raw card data (use the provider's hosted fields or tokens). Get legal advice on licensing, data protection, and KYC/AML for your country before launch. |
| 13 | **Clocks and time** | Provider time, our time, and time zones differ. | UTC only. Listings use a database-side watermark (DEC-0019). |
| 14 | **Backups and recovery** | The ledger is the most important database. | Point-in-time recovery and a restore drill are launch requirements. |

## What changed in the ledger design because of this decision

- The ledger no longer has gateway or reconciliation tables, or provider logic. It is provider-agnostic.
- **Clients and scopes moved into v1.** Separate services need separate identities, and idempotency keys are scoped per client.
- **`external_ref`** is a first-class, unique-per-client field. Other services use it to match their records.
- **A safe read API** (with a watermark) is a v1 feature, because reconciliation needs it.
- **Least-privilege database roles**, so a bug in the app cannot rewrite history.
- **An OpenAPI contract** is the source of truth from day one.
- Rules INV-11 to INV-16 are new. The old gateway and reconciliation invariants moved out of this service.

## Conditions we adopt

1. The ledger stays language-agnostic at its edge: HTTP and OpenAPI only.
2. **A second language must earn its place.** When the gateway starts, answer in writing: what does this language give us that TypeScript does not, and is it worth another runtime, image, CI lane, and review burden? Do the same for reconciliation.
3. Every service has the same shape: `Dockerfile`, `/health`, `/health/ready`, an OpenAPI file, the same environment rules, and its own `AGENTS.md`.
4. No service reads another service's database.
5. Revisit this document when the gateway starts.
