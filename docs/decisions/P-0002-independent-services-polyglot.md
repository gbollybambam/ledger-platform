# P-0002: Independent services. The stack is chosen per service.

- Date: 2026-10-27
- Status: accepted, with conditions
- Read first: [architecture-assessment.md](../architecture-assessment.md)

## Decision

The platform is three independently deployable services: **ledger**, **gateway**, and **reconciliation**. Each has its own database, release cycle, and stack.

- Ledger: Node.js + TypeScript + PostgreSQL. Fixed (see ledger DEC-0009).
- Gateway: planned Laravel (PHP). **Not decided until the gateway starts.**
- Reconciliation: planned Python. **Not decided until reconciliation starts.**

## Rejected options

- A modular monolith (see the assessment, option A). It is the safer default for one developer. It was the earlier plan in this project. It is rejected because separate, isolated services are the goal.
- One language for everything (option B).

## Why

Service boundaries give isolation, clear ownership, and independent failure and release. Choosing the other stacks late keeps the decision reversible.

## Conditions

1. **A second language must earn its place.** When the gateway and reconciliation start, write down what the language gives us that TypeScript does not, and what it costs.
2. The ledger exposes only HTTP and OpenAPI. It knows nothing about providers, webhooks, payouts, or statements.
3. Every service has the same shape: `Dockerfile`, `/health`, `/health/ready`, an OpenAPI file, `AGENTS.md`, and the same environment rules.
4. No service reads another service's database (P-0003).
5. Revisit this decision when the gateway starts.

## Trade-offs and risks

More operations, more review burden, and distributed-systems problems from day one. The assessment lists each one and the rule we adopt.
