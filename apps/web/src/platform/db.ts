import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import { schema, type Database, type DbTransaction } from '@agency-os/db';
import { serverEnv } from './env';

export const verifiedClaimsSchema = z.object({
  sub: z.uuid(),
  role: z.literal('authenticated'),
  aal: z.enum(['aal1', 'aal2']),
  session_id: z.uuid(),
  amr: z.array(z.object({ method: z.string(), timestamp: z.number() })),
});

export type VerifiedClaims = z.infer<typeof verifiedClaimsSchema>;

export type DbContexts = {
  withUserContext<T>(claims: VerifiedClaims, fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
  withSystemContext<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
};

export function createDbContexts(db: Database): DbContexts {
  return {
    async withUserContext(claims, fn) {
      const parsed = verifiedClaimsSchema.safeParse(claims);
      if (!parsed.success) throw new Error('Invalid claims for user database context');

      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${JSON.stringify(parsed.data)}, true)`,
        );
        await tx.execute(sql`set local role authenticated`);
        return fn(tx);
      });
    },

    async withSystemContext(fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`reset role`);
        await tx.execute(sql`select set_config('request.jwt.claims', '', true)`);
        return fn(tx);
      });
    },
  };
}

const globalForDatabase = globalThis as unknown as { agencyOsDatabase?: Database };

function getDatabase(): Database {
  if (!globalForDatabase.agencyOsDatabase) {
    const client = postgres(serverEnv().DATABASE_URL, { prepare: false, max: 5 });
    globalForDatabase.agencyOsDatabase = drizzle({ client, schema });
  }
  return globalForDatabase.agencyOsDatabase;
}

export function withUserContext<T>(
  claims: VerifiedClaims,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return createDbContexts(getDatabase()).withUserContext(claims, fn);
}

export function withSystemContext<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return createDbContexts(getDatabase()).withSystemContext(fn);
}
