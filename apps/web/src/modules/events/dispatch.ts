import { sql } from 'drizzle-orm';
import type { DbContexts } from '@/platform/db';

export type OutboxEvent = {
  id: string;
  name: string;
  data: { organizationId: string; clientId: string | null; payload: unknown };
};

export type OutboxFailure = {
  id: string;
  type: string;
  attempts: number;
  error: string;
};

export type OutboxDispatcherOptions = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  send: (events: OutboxEvent[]) => Promise<void>;
  reportFailure: (failure: OutboxFailure) => void;
  batchSize?: number;
  maxAttempts?: number;
};

export type DispatchResult = { dispatched: number; failed: number };

type PendingRow = {
  id: string;
  type: string;
  organization_id: string;
  client_id: string | null;
  payload: unknown;
  attempts: number;
};

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_ERROR_LENGTH = 1000;

export function createOutboxDispatcher(
  options: OutboxDispatcherOptions,
): () => Promise<DispatchResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  return () =>
    options.contexts.withSystemContext(async (tx) => {
      const rows = await tx.execute<PendingRow>(sql`
        select id, type, organization_id, client_id, payload, attempts
        from public.domain_events
        where status = 'pending'
        order by created_at
        limit ${batchSize}
        for update skip locked
      `);
      if (rows.length === 0) return { dispatched: 0, failed: 0 };

      const ids = sql.join(
        rows.map((row) => sql`${row.id}::uuid`),
        sql`, `,
      );

      try {
        await options.send(
          rows.map((row) => ({
            id: row.id,
            name: row.type,
            data: {
              organizationId: row.organization_id,
              clientId: row.client_id,
              payload: row.payload,
            },
          })),
        );
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(
          0,
          MAX_ERROR_LENGTH,
        );
        await tx.execute(sql`
          update public.domain_events
          set attempts = attempts + 1,
              last_error = ${message},
              status = case when attempts + 1 >= ${maxAttempts} then 'failed'::app.event_status
                            else 'pending'::app.event_status end,
              updated_at = now()
          where id in (${ids})
        `);

        const exhausted = rows.filter((row) => row.attempts + 1 >= maxAttempts);
        for (const row of exhausted) {
          options.reportFailure({
            id: row.id,
            type: row.type,
            attempts: row.attempts + 1,
            error: message,
          });
        }
        return { dispatched: 0, failed: exhausted.length };
      }

      await tx.execute(sql`
        update public.domain_events
        set status = 'dispatched', attempts = attempts + 1, dispatched_at = now(),
            last_error = null, updated_at = now()
        where id in (${ids})
      `);
      return { dispatched: rows.length, failed: 0 };
    });
}
