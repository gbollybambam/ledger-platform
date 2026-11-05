# DEC-0021: Strict input validation and fixed error messages

- Date: 2026-11-04
- Status: accepted

## Decision

- Every route with input has a JSON schema with `additionalProperties: false`.
- Fastify is created with `ajv.customOptions` `coerceTypes: false`, `removeAdditional: false`, `useDefaults: false`, `allErrors: false`.
- The body limit is 64 KiB (65536 bytes).
- Error messages are fixed text. A validation error says `Request is not valid`, or `Request is not valid: <field>` when `<field>` is a property defined in our own schemas. The text never contains a client-supplied name or value. (Ajv's "extra property" error carries the client's property name. It must never be used.)
- Other 4xx errors from the framework are mapped by status to fixed messages. The framework's own message is never forwarded.
- `text/plain` bodies fail schema validation (400). A missing or unknown content type gets 415.

## Rejected options

- Fastify's defaults. They convert types and drop unknown fields silently.
- Forwarding Ajv messages. They can contain client input.

## Why

Silent conversion is how an amount of `"100"` becomes `100`, or a typo is ignored. Money APIs must refuse, not guess.

## Trade-offs and risks

Developers get less detail in errors. The OpenAPI file is where the rules are written. A body larger than 64 KiB needs a per-route limit (decided in the feature that needs it).
