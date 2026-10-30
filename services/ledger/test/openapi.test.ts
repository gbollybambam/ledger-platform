import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildApp } from '../src/app.js';
import { createTestPool } from './helpers/db.js';

const SPEC_FILE = 'openapi/ledger.v1.yaml';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Operation {
  operationId?: string;
  parameters?: { $ref?: string }[];
}
type Spec = { paths: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], Operation>>> };

function specOperations(spec: Spec) {
  const found: { key: string; operation: Operation; method: string }[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation !== undefined) {
        found.push({ key: `${method.toUpperCase()} ${path}`, operation, method });
      }
    }
  }
  return found;
}

describe('OpenAPI contract', () => {
  let pool: Pool;
  let app: FastifyInstance;
  const spec = parse(readFileSync(SPEC_FILE, 'utf8')) as Spec;

  beforeAll(async () => {
    pool = createTestPool();
    app = buildApp({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('is a valid OpenAPI document', async () => {
    await expect(SwaggerParser.validate(SPEC_FILE)).resolves.toBeDefined();
  });

  it('documents every route the app serves, and serves every route it documents', () => {
    const documented = new Set(specOperations(spec).map((o) => o.key));
    // Fastify writes "/accounts/:id". OpenAPI writes "/accounts/{id}".
    const served = new Set(
      [...app.routeTable].map((route) => route.replace(/:([A-Za-z0-9_]+)/g, '{$1}')),
    );
    expect([...served].sort()).toEqual([...documented].sort());
  });

  it('gives every operation a unique operationId', () => {
    const ids = specOperations(spec).map((o) => o.operation.operationId);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('requires an Idempotency-Key on every POST', () => {
    for (const { key, operation, method } of specOperations(spec)) {
      if (method === 'post') {
        const refs = (operation.parameters ?? []).map((p) => p.$ref);
        expect(refs, `${key} must use the IdempotencyKey parameter`).toContain(
          '#/components/parameters/IdempotencyKey',
        );
      }
    }
  });
});
