import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type DbExecutor = Database | DbTransaction;
