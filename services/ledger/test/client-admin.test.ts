import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runClientAdmin } from '../scripts/lib/client-admin.js';
import { closeTestDb, createTestClient, type TestClient } from './helpers/clients.js';
import { testUrls } from './helpers/db.js';

const execAsync = promisify(exec);
const cwd = process.cwd();
let parallelClient: TestClient;
const gatewayName = `gateway-${randomUUID().replaceAll('-', '').slice(0, 8)}`;

async function runCli(...args: string[]) {
  const command = args[0]!.replace('client:', '');
  const commandArgs = args.slice(1).filter((arg) => arg !== '--');
  let stdout = '';
  let stderr = '';
  const exitCode = await runClientAdmin([command, ...commandArgs], {
    databaseUrl: testUrls().migrator,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { exitCode, stdout, stderr };
}

async function runProcessCliWithEnv(extraEnv: NodeJS.ProcessEnv, ...args: string[]) {
  try {
    const command = `npm run --silent ${args.map((arg) => `"${arg.replaceAll('"', '\\"')}"`).join(' ')}`;
    const result = await execAsync(command, {
      cwd,
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: testUrls().migrator,
        ...extraEnv,
      },
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = typeof error === 'object' && error !== null ? error : {};
    const code = 'code' in failure ? failure.code : undefined;
    const stdout = 'stdout' in failure ? failure.stdout : undefined;
    const stderr = 'stderr' in failure ? failure.stderr : undefined;
    return {
      exitCode: typeof code === 'number' ? code : 2,
      stdout: typeof stdout === 'string' ? stdout : '',
      stderr: typeof stderr === 'string' ? stderr : '',
    };
  }
}

describe('client administration output', () => {
  let migrator: pg.Client;

  async function deleteClient(name: string): Promise<void> {
    await migrator.query('DELETE FROM clients WHERE name = $1', [name]);
  }

  beforeAll(async () => {
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    await migrator.query('DELETE FROM clients WHERE name = $1', [gatewayName]);
    parallelClient = await createTestClient({
      name: `parallel-${randomUUID().replaceAll('-', '').slice(0, 8)}`,
    });
  });

  afterAll(async () => {
    await migrator.query('DELETE FROM clients WHERE name = $1', [gatewayName]);
    await parallelClient.remove();
    await migrator.end();
    await closeTestDb();
  });

  it('client:create prints the exact fields and exposes the key exactly once', async () => {
    try {
      const result = await runCli(
        'client:create',
        '--',
        '--name',
        gatewayName,
        '--scopes',
        'ledger:write,ledger:read',
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(
        new RegExp(
          `^client created\\r?\\nid:[ ]{6}[0-9a-f-]{36}\\r?\\nname:[ ]+${gatewayName}\\r?\\nscopes:[ ]{2}ledger:read,ledger:write\\r?\\nprefix:[ ]{2}lk_[A-Za-z0-9_-]{5}\\r?\\napi_key: lk_[A-Za-z0-9_-]{43}\\r?\\n$`,
        ),
      );
      expect(result.stderr).toBe('Save this key now. It cannot be shown again.\n');

      const key = result.stdout.match(/^api_key: (lk_[A-Za-z0-9_-]{43})$/m)?.[1];
      expect(key).toBeDefined();
      expect(result.stdout.match(new RegExp(key!, 'g'))).toHaveLength(1);
      expect(result.stderr).not.toContain(key!);
    } finally {
      await deleteClient(gatewayName);
    }
  }, 60_000);

  it('keeps one real-process smoke path for create, list, and revoke', async () => {
    try {
      const created = await runProcessCliWithEnv(
        {},
        'client:create',
        '--',
        '--name',
        gatewayName,
        '--scopes',
        'ledger:read',
      );
      expect(created.exitCode).toBe(0);

      const listed = await runProcessCliWithEnv({}, 'client:list');
      expect(listed.exitCode).toBe(0);
      expect(listed.stdout).toContain(gatewayName);

      const revoked = await runProcessCliWithEnv({}, 'client:revoke', '--', '--name', gatewayName);
      expect(revoked.exitCode).toBe(0);
    } finally {
      await deleteClient(gatewayName);
    }
  }, 60_000);

  it('rejects invalid names, unknown scopes, and duplicate names with exit code 1', async () => {
    try {
      const invalidName = await runCli(
        'client:create',
        '--',
        '--name',
        'Bad_Name',
        '--scopes',
        'ledger:read',
      );
      expect(invalidName.exitCode).toBe(1);
      expect(invalidName.stderr).toContain('invalid');

      const unknownScope = await runCli(
        'client:create',
        '--',
        '--name',
        gatewayName,
        '--scopes',
        'ledger:nope',
      );
      expect(unknownScope.exitCode).toBe(1);
      expect(unknownScope.stderr).toContain('ledger:nope');
      expect(unknownScope.stderr).toContain('ledger:read');
      expect(unknownScope.stderr).toContain('ledger:write');

      const created = await runCli(
        'client:create',
        '--',
        '--name',
        gatewayName,
        '--scopes',
        'ledger:read',
      );
      expect(created.exitCode).toBe(0);

      const duplicate = await runCli(
        'client:create',
        '--',
        '--name',
        gatewayName,
        '--scopes',
        'ledger:read',
      );
      expect(duplicate.exitCode).toBe(1);
      expect(duplicate.stderr).toBe(`a client named "${gatewayName}" already exists\n`);
    } finally {
      await deleteClient(gatewayName);
    }
  }, 60_000);

  it('lists clients with padded columns and never prints a key or hash', async () => {
    try {
      await runCli('client:create', '--', '--name', gatewayName, '--scopes', 'ledger:read');
      const result = await runCli('client:list');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('NAME  ID  PREFIX  SCOPES  STATUS  CREATED');
      expect(result.stdout).toContain(gatewayName);
      expect(result.stdout).not.toMatch(/lk_[A-Za-z0-9_-]{43}/);
      expect(result.stdout).not.toMatch(/\b[a-f0-9]{64}\b/i);
    } finally {
      await deleteClient(gatewayName);
    }
  }, 60_000);

  it('revokes a client, is idempotent, and reports unknown names on stderr', async () => {
    try {
      await runCli('client:create', '--', '--name', gatewayName, '--scopes', 'ledger:read');
      const first = await runCli('client:revoke', '--', '--name', gatewayName);
      expect(first).toEqual({
        exitCode: 0,
        stdout: `client revoked: ${gatewayName}\n`,
        stderr: '',
      });

      const second = await runCli('client:revoke', '--', '--name', gatewayName);
      expect(second).toEqual({
        exitCode: 0,
        stdout: `client already revoked: ${gatewayName}\n`,
        stderr: '',
      });

      const unknown = await runCli('client:revoke', '--', '--name', 'missing');
      expect(unknown.exitCode).toBe(1);
      expect(unknown.stdout).toBe('');
      expect(unknown.stderr).toBe('client not found: missing\n');
      expect(unknown.stderr).not.toMatch(/lk_[A-Za-z0-9_-]{43}/);
      expect(unknown.stderr).not.toMatch(/\b[a-f0-9]{64}\b/i);
    } finally {
      await deleteClient(gatewayName);
    }
  }, 60_000);

  it('reports unexpected connection errors without exposing the URL or password', async () => {
    const databaseUrl = 'postgresql://admin:super-secret@127.0.0.1:1/ledger';
    const result = await runProcessCliWithEnv(
      { MIGRATION_DATABASE_URL: databaseUrl },
      'client:list',
    );

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^unexpected error \(code: [A-Z0-9_]+\)\r?\n$/);
    expect(result.stderr).not.toContain(databaseUrl);
    expect(result.stderr).not.toContain('super-secret');
  }, 60_000);

  it('handles parallel revokes atomically and preserves revoked_at', async () => {
    try {
      const results = await Promise.all([
        runCli('client:revoke', '--', '--name', parallelClient.name),
        runCli('client:revoke', '--', '--name', parallelClient.name),
      ]);

      expect(results.map((result) => result.exitCode).sort()).toEqual([0, 0]);
      expect(results.map((result) => result.stdout).sort()).toEqual([
        `client already revoked: ${parallelClient.name}\n`,
        `client revoked: ${parallelClient.name}\n`,
      ]);
      expect(results.every((result) => result.stderr === '')).toBe(true);

      const first = await migrator.query<{ revoked_at: Date }>(
        'SELECT revoked_at FROM clients WHERE id = $1',
        [parallelClient.id],
      );
      const firstRevokedAt = first.rows[0]?.revoked_at;
      expect(firstRevokedAt).toBeInstanceOf(Date);

      const repeated = await runCli('client:revoke', '--', '--name', parallelClient.name);
      expect(repeated).toEqual({
        exitCode: 0,
        stdout: `client already revoked: ${parallelClient.name}\n`,
        stderr: '',
      });

      const second = await migrator.query<{ revoked_at: Date }>(
        'SELECT revoked_at FROM clients WHERE id = $1',
        [parallelClient.id],
      );
      expect(second.rows[0]?.revoked_at).toEqual(firstRevokedAt);
    } finally {
      await deleteClient(parallelClient.name);
    }
  }, 60_000);
});
