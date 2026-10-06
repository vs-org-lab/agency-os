import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql, TransactionSql } from 'postgres';
import type { Database } from '../index';
import * as schema from '../schema';
import { getTestSql } from './db';

export function testDatabase(sql: TransactionSql): Database {
  const client = Object.assign(sql, { options: getTestSql().options }) as unknown as Sql;
  return drizzle({ client, schema });
}
