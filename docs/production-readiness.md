# Production readiness (the launch gate)

A version tag does not mean the system is safe for real money (see [P-0006](decisions/P-0006-production-readiness-gate.md)).
Real money may flow only when **every item below is done, has evidence, and is signed off**.

This list covers the ledger now. Add the gateway and reconciliation items when those services start.

Status values: `built in vX` (code, with a feature), `ops` (done outside the code), `planned vX`, `not started`.

## 1. Money correctness

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| Every invariant (INV-01 to INV-16) has an automated test | built in v1 (F1 to F9) | Test names listed in the release report |
| Concurrency stress test with hot accounts passes, many runs in a row | built in v1 (F5) | CI logs, and a 100-run soak result |
| Property-based tests for balance and idempotency | built in v1 (F3, F4) | Test files |
| `verify` passes after every integration test and on a copy of production data | built in v1 (F7), ops | Command output |
| Independent review of the posting algorithm and the database constraints by a human engineer | not started | Written review, with findings closed |
| Adversarial review by a second AI model against the invariants | not started | Report, with findings closed |
| Mutation testing on the posting code | planned v1.1 | Mutation score report |

## 2. Security

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| API keys are random, hashed at rest, never logged | built in v1 (F1) | Tests, plus a log sample |
| Scopes enforced on every route | built in v1 (F1) | Tests |
| Rate limiting and lockout for failed authentication | planned v1.1 | Test and config |
| TLS on every connection (clients to service, service to database) | ops | Config and a scan |
| Secrets in a secret manager, never in the repo or the image | ops | Review |
| Key rotation procedure tested | ops | Runbook and a drill record |
| Dependency scanning and updates (Dependabot, `npm audit`) | built in v1 | CI |
| Container image scan and non-root runtime | built in v1 (image), ops (scan) | Scan report |
| Penetration test or security review by a third party | not started | Report, with findings closed |
| Security contact and disclosure policy published | not started | `SECURITY.md` |

## 3. Reliability and operations

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| Database high availability and a failover test | ops | Drill record |
| Time limits on statements, locks, transactions | built in v1 | Tests |
| Graceful shutdown and no lost writes on deploy | built in v1 (F9) | Test |
| Zero-downtime migration approach written and rehearsed | ops | Runbook and a rehearsal |
| Load test at 2x expected peak | built in v1 (F9, benchmark), ops | Report |
| Capacity limits known for a busy account | built in v1 (F9) | Benchmark |
| Runbooks: outage, stuck transactions, verify failure, key leak | not started | Reviewed runbooks |

## 4. Observability

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| Structured logs with request IDs, no secrets | built in v1 | Tests |
| Metrics (latency, errors, lock waits, pool use) | planned v1.1 | Dashboard |
| Alerts: error rate, latency, `verify` failure, replication lag, disk | not started | Alert list and a test alert |
| Trace context (`traceparent`) propagation | planned v1.1 | Test |
| Audit log of who changed what | planned v1.1 | Table and tests |

## 5. Data protection and recovery

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| Backups with point-in-time recovery | ops | Config |
| **A restore drill that works**, with timing | ops (written in F9) | Drill record |
| RPO and RTO written down and met in the drill | not started | Numbers |
| Encryption at rest | ops | Config |
| Retention and deletion rules (ledger entries are never deleted) | not started | Policy |

## 6. Process and people

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| Branch protection, required CI, required review | ops | Settings export |
| Two-person rule for production changes and migrations | not started | Process |
| On-call owner and an escalation path | not started | Names |
| Incident response and post-incident review process | not started | Document |

## 7. Legal and compliance

I can't give legal advice. Get it from a qualified person in your country **before** real money flows.

| Item | Status | Evidence required |
| ---- | ------ | ----------------- |
| Which licenses or approvals are needed to hold or move customer funds | not started | Written advice |
| Data protection law obligations (for Nigeria, the NDPA, and any other country with users) | not started | Written advice and a plan |
| KYC and AML responsibility (who does it, and where) | not started | Written policy |
| Provider and bank agreements | not started | Contracts |
| Card data: never stored here. Use the provider's hosted fields or tokens | design rule | Design review |

## Sign-off

| Role | Name | Date | Signature |
| ---- | ---- | ---- | --------- |
| Owner |  |  |  |
| Independent engineer |  |  |  |
| Security reviewer |  |  |  |
| Legal or compliance |  |  |  |
