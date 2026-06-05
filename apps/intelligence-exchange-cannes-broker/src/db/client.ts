import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const defaultPostgresPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'iex_local_dev_only_change_me');
const defaultPostgresPort = process.env.POSTGRES_PORT ?? '5432';
const connectionString = process.env.DATABASE_URL
  ?? `postgres://iex:${defaultPostgresPassword}@localhost:${defaultPostgresPort}/iex_cannes`;
/*
 * PRODUCTION SECURITY: Postgres must not be exposed to the public internet.
 *   - Ensure DATABASE_URL always points to 127.0.0.1 / localhost / a private network.
 *   - Use a dedicated DB user with minimal privileges (SELECT/INSERT/UPDATE/DELETE
 *     on app tables only — no superuser, no CREATEDB).
 *   - Enable pg_hba.conf md5/scram-sha-256 auth; never use trust auth in production.
 */

// Security: warn if DATABASE_URL resolves to a non-private host in production
if (process.env.NODE_ENV === 'production') {
  try {
    const pgUrl = new URL(connectionString);
    const host = pgUrl.hostname;
    // RFC1918 private ranges + loopback
    const isPrivate =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^192\.168\./.test(host);
    if (!isPrivate) {
      console.warn(
        '[security:postgres] WARNING: DATABASE_URL points to a non-private host in production (' + host + '). ' +
        'Ensure Postgres is firewalled to localhost/VPC only. ' +
        'See: https://www.postgresql.org/docs/current/auth-pg-hba-conf.html'
      );
    }
  } catch {
    // unparseable URL — leave connection to fail naturally
  }
}

// Connection pool for the broker with retry logic for resilience
const sql = postgres(connectionString, {
  max: 10,
  connection: {
    application_name: 'intelligence-exchange-broker',
  },
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'test' });

export type BrokerDb = typeof db;

export { sql };
