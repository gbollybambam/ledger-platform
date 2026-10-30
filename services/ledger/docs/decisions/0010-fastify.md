# DEC-0010: Fastify as the HTTP framework

- Date: 2026-10-27
- Status: accepted

## Decision

Use Fastify (version 5) for the HTTP layer.

## Rejected options

- Express. Very common, but request validation, logging, and typing need extra packages.
- NestJS. Too much structure and magic for a project where I want to see every line.

## Why

- Built-in JSON schema validation for request bodies.
- Built-in structured logging (pino) with request IDs.
- `app.inject()` runs requests in tests without opening a port.
- Hooks make per-route authentication and scope checks simple and explicit.

## Trade-offs and risks

A smaller community than Express. The plugin model takes time to learn. The HTTP layer is thin, so switching later would be a small job.
