import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testUrls } from './helpers/db.js';

const execAsync = promisify(exec);
const cwd = process.cwd();

async function runCli(...args: string[]) {
  try {
    const command = `npm run ${args.map((arg) => `"${arg.replaceAll('"', '\\"')}"`).join(' ')}`;
    const result = await execAsync(command, {
      cwd,
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: testUrls().migrator,
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

  beforeAll(async () => {
    migrator = new pg.Client({ connectionString: testUrls().migrator });
    await migrator.connect();
    await migrator.query('DELETE FROM clients WHERE name = $1', ['gateway']);
  });

  afterAll(async () => {
    await migrator.query('DELETE FROM clients WHERE name = $1', ['gateway']);
    await migrator.end();
  });

  it('client:create prints the exact fields and exposes the key exactly once', async () => {
    const result = await runCli(
      'client:create',
      '--',
      '--name',
      'gateway',
      '--scopes',
      'ledger:write,ledger:read',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(
      /^client created\r?\nid:[ ]{6}[0-9a-f-]{36}\r?\nname:[ ]{4}gateway\r?\nscopes:[ ]{2}ledger:read,ledger:write\r?\nprefix:[ ]{2}lk_[A-Za-z0-9_-]{5}\r?\napi_key: lk_[A-Za-z0-9_-]{43}\r?\n$/,
    );
    expect(result.stderr).toBe('Save this key now. It cannot be shown again.\n');

    const key = result.stdout.match(/^api_key: (lk_[A-Za-z0-9_-]{43})$/m)?.[1];
    expect(key).toBeDefined();
    expect(result.stdout.match(new RegExp(key!, 'g'))).toHaveLength(1);
    expect(result.stderr).not.toContain(key!);
  });

  it('rejects invalid names, unknown scopes, and duplicate names with exit code 1', async () => {
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
      'gateway',
      '--scopes',
      'ledger:nope',
    );
    expect(unknownScope.exitCode).toBe(1);
    expect(unknownScope.stderr).toContain('ledger:nope');
    expect(unknownScope.stderr).toContain('ledger:read');
    expect(unknownScope.stderr).toContain('ledger:write');

    const duplicate = await runCli(
      'client:create',
      '--',
      '--name',
      'gateway',
      '--scopes',
      'ledger:read',
    );
    expect(duplicate.exitCode).toBe(1);
    expect(duplicate.stderr).toBe('a client named "gateway" already exists\n');
  });

  it('lists clients with padded columns and never prints a key or hash', async () => {
    const result = await runCli('client:list');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('NAME  ID  PREFIX  SCOPES  STATUS  CREATED');
    expect(result.stdout).toContain('gateway');
    expect(result.stdout).not.toMatch(/lk_[A-Za-z0-9_-]{43}/);
    expect(result.stdout).not.toMatch(/\b[a-f0-9]{64}\b/i);
  });

  it('revokes a client, is idempotent, and reports unknown names on stderr', async () => {
    const first = await runCli('client:revoke', '--', '--name', 'gateway');
    expect(first).toEqual({
      exitCode: 0,
      stdout: 'client revoked: gateway\n',
      stderr: '',
    });

    const second = await runCli('client:revoke', '--', '--name', 'gateway');
    expect(second).toEqual({
      exitCode: 0,
      stdout: 'client already revoked: gateway\n',
      stderr: '',
    });

    const unknown = await runCli('client:revoke', '--', '--name', 'missing');
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stdout).toBe('');
    expect(unknown.stderr).toBe('client not found: missing\n');
    expect(unknown.stderr).not.toMatch(/lk_[A-Za-z0-9_-]{43}/);
    expect(unknown.stderr).not.toMatch(/\b[a-f0-9]{64}\b/i);
  });
});
