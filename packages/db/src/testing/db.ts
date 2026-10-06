import postgres, { type Sql, type TransactionSql } from 'postgres';

let client: Sql | null = null;

class TestRollback extends Error {
  constructor() {
    super('Test transaction rolled back');
  }
}

export function getTestSql(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_DIRECT_URL;
  if (!url) throw new Error('DATABASE_DIRECT_URL is not set');
  client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  return client;
}

export async function withTestTransaction<T>(
  fn: (sql: TransactionSql) => Promise<T>,
): Promise<void> {
  try {
    await getTestSql().begin(async (sql) => {
      await fn(sql);
      throw new TestRollback();
    });
  } catch (error) {
    if (!(error instanceof TestRollback)) throw error;
  }
}

export async function closeTestSql(): Promise<void> {
  if (!client) return;
  await client.end({ timeout: 5 });
  client = null;
}
