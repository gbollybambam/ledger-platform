import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const SPEC_FILE = 'openapi/ledger.v1.yaml';

interface OpenApiSpec {
  paths: Record<
    string,
    {
      get?: {
        security?: unknown[];
        responses?: Record<string, unknown>;
      };
    }
  >;
}

describe('F1 OpenAPI contract', () => {
  it('documents whoami with bearer authentication and 401/403 responses', async () => {
    const spec = parse(readFileSync(SPEC_FILE, 'utf8')) as OpenApiSpec;

    await expect(SwaggerParser.validate(SPEC_FILE)).resolves.toBeDefined();
    const whoami = spec.paths['/v1/whoami']?.get;
    expect(whoami?.security).toEqual([{ bearerAuth: [] }]);
    expect(whoami?.responses?.['200']).toBeDefined();
    expect(whoami?.responses?.['401']).toBeDefined();
    expect(whoami?.responses?.['403']).toBeDefined();
  });
});
