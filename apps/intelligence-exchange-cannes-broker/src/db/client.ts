import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const defaultPostgresPassword = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'iex_local_dev_only_change_me');
const defaultPostgresPort = process.env.POSTGRES_PORT ?? '5432';
const connectionString = process.env.DATABASE_URL
  ?? `postgres://iex:${defaultPostgresPassword}@localhost:${defaultPostgresPort}/iex_cannes`;

// Connection pool for the broker
const sql = postgres(connectionString, { max: 10 });

export const db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'test' });

export type BrokerDb = typeof db;

export { sql };
