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
  user_kind: z.enum(['internal', 'client']).nullable().optional(),
  email: z.string().optional(),
});

/**
 * Claims as the server code carries them. `preview_client` never comes from a token: the client
 * preview adds it after authorising the reader, and the database honours it only read-only.
 */
const contextClaimsSchema = verifiedClaimsSchema.extend({ preview_client: z.uuid().optional() });

export type VerifiedClaims = z.infer<typeof contextClaimsSchema>;

export type DbContexts = {
  withUserContext<T>(claims: VerifiedClaims, fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
  withSystemContext<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
};

export function createDbContexts(db: Database): DbContexts {
  return {
    async withUserContext(claims, fn) {
      const parsed = contextClaimsSchema.safeParse(claims);
      if (!parsed.success) throw new Error('Invalid claims for user database context');
      const { preview_client: previewClient, ...tokenClaims } = parsed.data;

      // One statement per context switch: every round trip to the pooler adds to page latency.
      return db.transaction(async (tx) => {
        if (previewClient) {
          // The previewing staff member keeps their own identity in the token claims.
          await tx.execute(
            sql`select set_config('request.jwt.claims', ${JSON.stringify({ ...tokenClaims, user_kind: 'internal' })}, true), set_config('role', 'authenticated', true), set_config('app.preview_client', ${previewClient}, true), set_config('transaction_read_only', 'on', true)`,
          );
        } else {
          await tx.execute(
            sql`select set_config('request.jwt.claims', ${JSON.stringify(tokenClaims)}, true), set_config('role', 'authenticated', true)`,
          );
        }
        return fn(tx);
      });
    },

    async withSystemContext(fn) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claims', '', true), set_config('role', 'none', true)`,
        );
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
