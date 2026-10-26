import 'server-only';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { clients, deals, tasks } = schema;

const RESULTS_PER_KIND = 5;

const querySchema = z.string().trim().min(2).max(80);

export type CommandResult = {
  kind: 'client' | 'deal' | 'task';
  id: string;
  title: string;
  context: string | null;
  href: string;
};

export type SearchOutcome =
  | { ok: true; results: CommandResult[] }
  | { ok: false; rule: 'forbidden' | 'invalid_input' | 'unavailable' };

/** Escapes the LIKE metacharacters so the query always matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function containsLiteral(column: PgColumn, query: string): SQL {
  return sql`${column} ilike ${`%${escapeLike(query)}%`} escape ${'\\'}`;
}

export async function searchWorkspace(
  claims: VerifiedClaims,
  query: string,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<SearchOutcome> {
  if (claims.user_kind !== 'internal' || claims.aal !== 'aal2') {
    return { ok: false, rule: 'forbidden' };
  }
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const term = parsed.data;

  const results = await deps.contexts.withUserContext(claims, async (tx) => {
    const clientRows = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(isNull(clients.archivedAt), containsLiteral(clients.name, term)))
      .orderBy(desc(clients.updatedAt))
      .limit(RESULTS_PER_KIND);

    const dealRows = await tx
      .select({ id: deals.id, title: deals.title, clientName: clients.name })
      .from(deals)
      .innerJoin(clients, eq(clients.id, deals.clientId))
      .where(and(isNull(deals.archivedAt), containsLiteral(deals.title, term)))
      .orderBy(desc(deals.updatedAt))
      .limit(RESULTS_PER_KIND);

    const taskRows = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        clientId: tasks.clientId,
        clientName: clients.name,
      })
      .from(tasks)
      .leftJoin(clients, eq(clients.id, tasks.clientId))
      .where(and(eq(tasks.status, 'open'), containsLiteral(tasks.title, term)))
      .orderBy(desc(tasks.updatedAt))
      .limit(RESULTS_PER_KIND);

    return [
      ...clientRows.map((row): CommandResult => ({
        kind: 'client',
        id: row.id,
        title: row.name,
        context: null,
        href: `/c/${row.id}`,
      })),
      ...dealRows.map((row): CommandResult => ({
        kind: 'deal',
        id: row.id,
        title: row.title,
        context: row.clientName,
        href: `/pipeline/${row.id}`,
      })),
      ...taskRows.map((row): CommandResult => ({
        kind: 'task',
        id: row.id,
        title: row.title,
        context: row.clientName,
        href: row.clientId ? `/c/${row.clientId}/tasks` : '/tasks',
      })),
    ];
  });

  return { ok: true, results };
}
