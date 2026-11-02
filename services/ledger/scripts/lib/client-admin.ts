import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '../../src/auth/keys.js';
import { SCOPES, type Scope } from '../../src/auth/types.js';

export interface OutputWriters {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface ClientAdminOptions extends OutputWriters {
  databaseUrl?: string;
}

interface ClientRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: Scope[];
  status: 'active' | 'revoked';
  created_at: Date;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function parseOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function validateName(name: string | undefined): string {
  if (name === undefined || !NAME_PATTERN.test(name)) {
    throw new ClientInputError(
      'invalid client name: use 2-40 lowercase letters, digits, or hyphens, starting with a letter',
    );
  }
  return name;
}

function validateScopes(value: string | undefined): Scope[] {
  if (value === undefined || value === '') {
    throw new ClientInputError(`scopes are required; allowed scopes: ${SCOPES.join(', ')}`);
  }

  const scopes: Scope[] = [];
  for (const valueScope of [...new Set(value.split(',').map((scope) => scope.trim()))].sort()) {
    const scope = SCOPES.find((allowedScope) => allowedScope === valueScope);
    if (scope === undefined) {
      throw new ClientInputError(
        `unknown scope "${valueScope}"; allowed scopes: ${SCOPES.join(', ')}`,
      );
    }
    scopes.push(scope);
  }
  return scopes;
}

class ClientInputError extends Error {}

function needDatabaseUrl(databaseUrl: string | undefined): string {
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new ClientInputError('MIGRATION_DATABASE_URL is required');
  }
  return databaseUrl;
}

function printError(writers: OutputWriters, error: unknown): number {
  if (error instanceof ClientInputError) {
    writers.stderr(`${error.message}\n`);
    return 1;
  }

  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'unknown';
  writers.stderr(`unexpected error (code: ${code})\n`);
  return 2;
}

async function createClient(args: readonly string[], writers: OutputWriters, databaseUrl: string) {
  const name = validateName(parseOption(args, '--name'));
  const scopes = validateScopes(parseOption(args, '--scopes'));
  const key = generateApiKey();
  const id = randomUUID();

  const client = new pg.Client({ connectionString: databaseUrl });
  let connectionError: unknown;
  client.on('error', (error) => {
    connectionError = error;
  });
  try {
    await client.connect();
  } catch (error) {
    throw connectionError ?? error;
  }
  try {
    const existing = await client.query('SELECT 1 FROM clients WHERE name = $1', [name]);
    if (existing.rowCount !== 0) {
      throw new ClientInputError(`a client named "${name}" already exists`);
    }

    try {
      await client.query(
        `INSERT INTO clients (id, name, key_prefix, key_hash, scopes)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, name, apiKeyPrefix(key), hashApiKey(key), scopes],
      );
    } catch (error) {
      if (isPgError(error, '23505')) {
        throw new ClientInputError(`a client named "${name}" already exists`);
      }
      throw error;
    }
  } finally {
    await client.end();
  }

  writers.stdout(
    `client created\nid:      ${id}\nname:    ${name}\nscopes:  ${scopes.join(',')}\nprefix:  ${apiKeyPrefix(key)}\napi_key: ${key}\n`,
  );
  writers.stderr('Save this key now. It cannot be shown again.\n');
}

function formatClients(rows: ClientRow[], stdout: (text: string) => void): void {
  if (rows.length === 0) {
    stdout('no clients\n');
    return;
  }

  const values = rows.map((row) => [
    row.name,
    row.id,
    row.key_prefix,
    row.scopes.join(','),
    row.status,
    row.created_at.toISOString(),
  ]);
  const headers = ['NAME', 'ID', 'PREFIX', 'SCOPES', 'STATUS', 'CREATED'];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => row[index]!.length)),
  );
  const line = (row: string[]) =>
    row
      .map((value, index) => value.padEnd(widths[index]!))
      .join('  ')
      .trimEnd();

  stdout(`${headers.join('  ')}\n`);
  for (const row of values) {
    stdout(`${line(row)}\n`);
  }
}

async function listClients(writers: OutputWriters, databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  let connectionError: unknown;
  client.on('error', (error) => {
    connectionError = error;
  });
  try {
    await client.connect();
  } catch (error) {
    throw connectionError ?? error;
  }
  try {
    const result = await client.query<ClientRow>(
      `SELECT id, name, key_prefix, scopes, status, created_at
         FROM clients
        ORDER BY name`,
    );
    formatClients(result.rows, writers.stdout);
  } finally {
    await client.end();
  }
}

async function revokeClient(args: readonly string[], writers: OutputWriters, databaseUrl: string) {
  const name = validateName(parseOption(args, '--name'));
  const client = new pg.Client({ connectionString: databaseUrl });
  let connectionError: unknown;
  client.on('error', (error) => {
    connectionError = error;
  });
  try {
    await client.connect();
  } catch (error) {
    throw connectionError ?? error;
  }
  try {
    const result = await client.query<{ id: string }>(
      `UPDATE clients
          SET status = 'revoked', revoked_at = now()
        WHERE name = $1 AND status = 'active'
      RETURNING id`,
      [name],
    );
    if (result.rowCount !== 0) {
      writers.stdout(`client revoked: ${name}\n`);
      return 0;
    }

    const existing = await client.query<{ status: 'active' | 'revoked' }>(
      `SELECT status FROM clients WHERE name = $1`,
      [name],
    );
    const row = existing.rows[0];
    if (row?.status === 'revoked') {
      writers.stdout(`client already revoked: ${name}\n`);
      return 0;
    }
    writers.stderr(`client not found: ${name}\n`);
    return 1;
  } finally {
    await client.end();
  }
}

export async function runClientAdmin(
  args: readonly string[],
  options: ClientAdminOptions,
): Promise<number> {
  try {
    const databaseUrl = needDatabaseUrl(options.databaseUrl);
    const command = args[0];
    if (command === 'create') {
      await createClient(args.slice(1), options, databaseUrl);
      return 0;
    }
    if (command === 'list') {
      await listClients(options, databaseUrl);
      return 0;
    }
    if (command === 'revoke') {
      return await revokeClient(args.slice(1), options, databaseUrl);
    }
    throw new ClientInputError('invalid command; use create, list, or revoke');
  } catch (error) {
    return printError(options, error);
  }
}
