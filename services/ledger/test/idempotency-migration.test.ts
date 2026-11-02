import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDir = join(process.cwd(), 'migrations');

function migrationSql(): string {
  const file = readdirMigration();
  return file === undefined ? '' : readFileSync(join(migrationDir, file), 'utf8');
}

function readdirMigration(): string | undefined {
  const file = readdirSync(migrationDir).find((candidate) =>
    candidate.endsWith('_create-idempotency-keys.sql'),
  );
  return file !== undefined && existsSync(join(migrationDir, file)) ? file : undefined;
}

describe('idempotency migration', () => {
  it('protects stored responses', () => {
    expect(migrationSql()).toContain('CREATE FUNCTION idempotency_keys_freeze()');
    expect(migrationSql()).toContain('BEFORE UPDATE ON idempotency_keys');
  });

  it('refuses to commit a key without a response', () => {
    expect(migrationSql()).toContain('CREATE FUNCTION idempotency_keys_require_response()');
    expect(migrationSql()).toContain('DEFERRABLE INITIALLY DEFERRED');
  });

  it('grants only the needed privileges', () => {
    const sql = migrationSql();
    expect(sql).toContain('GRANT SELECT, INSERT ON idempotency_keys TO ledger_app');
    expect(sql).toContain(
      'GRANT UPDATE (response_code, response_body) ON idempotency_keys TO ledger_app',
    );
    expect(sql).not.toContain('GRANT ALL');
    expect(sql).not.toContain('GRANT DELETE');
  });

  it('enforces key and status formats in the database', () => {
    const sql = migrationSql();
    expect(sql).toContain("CHECK (key ~ '^[A-Za-z0-9._:-]{8,128}$')");
    expect(sql).toContain("CHECK (request_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain('CHECK (response_code BETWEEN 200 AND 299)');
    expect(sql).toContain('CHECK ((response_code IS NULL) = (response_body IS NULL))');
  });

  it('documents the idempotency contract', () => {
    const spec = readFileSync(join(process.cwd(), 'openapi', 'ledger.v1.yaml'), 'utf8');
    expect(spec).toContain('IdempotentReplayed');
    expect(spec).toContain('idempotency_key_reused');
    expect(spec).toContain('Retry-After');
    expect(spec).toContain('Busy:');
  });
});
