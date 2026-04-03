import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL ?? 'postgres://iex:iex@localhost:5432/iex_cannes';

// Connection pool for the broker
const sql = postgres(connectionString, { max: 10 });

export const db = drizzle(sql, { schema, logger: process.env.NODE_ENV !== 'test' });

export type BrokerDb = typeof db;

export { sql };
