import pg from 'pg';
import { DB_TIMEOUTS_MS } from '../../src/db/timeouts.js';

export interface BootstrapInput {
  /** A superuser or role-admin connection. Used only here. Never given to the app. */
  adminUrl: string;
  /** Connection for the role that owns the schema and runs migrations. */
  migratorUrl: string;
  /** Connection for the limited role the running service uses. */
  appUrl: string;
}

interface RoleSpec {
  name: string;
  password: string;
}

function roleFromUrl(url: string, label: string): RoleSpec {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (name === '' || password === '') {
    throw new Error(`${label} must include a user name and a password`);
  }
  return { name, password };
}

/**
 * Creates or updates the two database roles and locks the database down.
 * It is safe to run many times (idempotent).
 *
 * Roles:
 * - migrator: owns the database and its tables. Runs migrations. Not used by the app.
 * - app: the running service. It gets only the privileges that each migration grants.
 */
export async function bootstrapRoles(input: BootstrapInput): Promise<void> {
  const migrator = roleFromUrl(input.migratorUrl, 'migrator URL');
  const app = roleFromUrl(input.appUrl, 'app URL');
  if (migrator.name === app.name) {
    throw new Error('The migrator and app roles must be different');
  }

  const client = new pg.Client({ connectionString: input.adminUrl });
  await client.connect();
  try {
    const db = client.escapeIdentifier(
      (await client.query<{ name: string }>('SELECT current_database() AS name')).rows[0]!.name,
    );
    const m = client.escapeIdentifier(migrator.name);
    const a = client.escapeIdentifier(app.name);

    const version = Number(
      (await client.query<{ v: string }>('SHOW server_version_num')).rows[0]!.v,
    );
    if (version < 170000) {
      throw new Error('PostgreSQL 17 or newer is required (it has transaction_timeout)');
    }

    await client.query('BEGIN');
    for (const role of [migrator, app]) {
      const ident = client.escapeIdentifier(role.name);
      const literal = client.escapeLiteral(role.password);
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
      const verb = exists.rowCount === 0 ? 'CREATE' : 'ALTER';
      await client.query(
        `${verb} ROLE ${ident} LOGIN PASSWORD ${literal} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
    }

    await client.query(`ALTER DATABASE ${db} OWNER TO ${m}`);
    await client.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${db} TO ${m}, ${a}`);

    // Nobody but the owner may create objects. The app may only look up names.
    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query(`GRANT ALL ON SCHEMA public TO ${m}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${a}`);

    // New functions are not callable by everyone by default.
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${m} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`,
    );

    // Time limits as role defaults, in addition to the pool settings.
    await client.query(`ALTER ROLE ${a} SET statement_timeout = ${DB_TIMEOUTS_MS.statement}`);
    await client.query(`ALTER ROLE ${a} SET lock_timeout = ${DB_TIMEOUTS_MS.lock}`);
    await client.query(
      `ALTER ROLE ${a} SET idle_in_transaction_session_timeout = ${DB_TIMEOUTS_MS.idleInTransaction}`,
    );
    await client.query(`ALTER ROLE ${a} SET transaction_timeout = ${DB_TIMEOUTS_MS.transaction}`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}
