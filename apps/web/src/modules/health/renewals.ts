import { eq, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { soleClientManager } from '@/modules/rooms/server';
import { logger } from '@/platform/logger';
import type { HealthDeps } from './access';
import { renewalsDue } from './domain/anniversaries';

const { clientMilestones, tasks } = schema;

/** RF-161: the renewal box task and what goes in it. */
export const RENEWAL_TASK = 'Enviar caixa de celebração da renovação';
const RENEWAL_NOTES =
  'Caixa de celebração da renovação: monumento, carta, espumante ou alternativa sem álcool.';
const PRINTED_MANUAL = ' Incluir o manual impresso do Brand Hub.';
const RENEWAL_TASK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * AUT-29, every morning: each active client whose first signed contract had an anniversary in
 * the last 7 days gets the renewal box task once for that year. One transaction per client; the
 * milestone row is written first, so a repeated or concurrent sweep creates nothing more.
 */
export async function sweepRenewals(today: string, deps: HealthDeps): Promise<number> {
  const partners = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ id: string; organization_id: string; first_signed: string }>(sql`
      select c.id, c.organization_id,
             (min(k.signed_at) at time zone 'Europe/Lisbon')::date::text as first_signed
      from public.clients c
      join public.contracts k on k.client_id = c.id and k.status = 'signed'
                             and k.signed_at is not null
      where c.lifecycle = 'active' and c.archived_at is null
      group by c.id, c.organization_id
    `),
  );
  let created = 0;
  for (const partner of partners) {
    for (const due of renewalsDue(partner.first_signed, today)) {
      try {
        const made = await deps.contexts.withSystemContext(async (tx) => {
          const [milestone] = await tx
            .insert(clientMilestones)
            .values({
              organizationId: partner.organization_id,
              clientId: partner.id,
              kind: 'renewal_anniversary',
              year: due.year,
            })
            .onConflictDoNothing()
            .returning({ id: clientMilestones.id });
          if (!milestone) return false;
          const [project] = await tx.execute<{ id: string }>(sql`
            select id from public.projects where client_id = ${partner.id}::uuid
            order by created_at desc limit 1
          `);
          const [hub] = await tx.execute<{ id: string }>(sql`
            select id from public.brand_hub_publications where client_id = ${partner.id}::uuid
            limit 1
          `);
          const [task] = await tx
            .insert(tasks)
            .values({
              organizationId: partner.organization_id,
              clientId: partner.id,
              projectId: project?.id ?? null,
              title: RENEWAL_TASK,
              notes: hub ? `${RENEWAL_NOTES}${PRINTED_MANUAL}` : RENEWAL_NOTES,
              assigneeId: await soleClientManager(tx, partner.id),
              dueOn: addDays(today, RENEWAL_TASK_DAYS),
            })
            .returning({ id: tasks.id });
          if (!task) throw new Error('The renewal task was not created');
          await tx
            .update(clientMilestones)
            .set({ taskId: task.id })
            .where(eq(clientMilestones.id, milestone.id));
          await recordAudit(tx, {
            organizationId: partner.organization_id,
            action: 'client.renewal_due',
            resourceType: 'client',
            resourceId: partner.id,
            clientId: partner.id,
            metadata: { year: due.year, anniversary: due.on },
          });
          return true;
        });
        if (made) created += 1;
      } catch (error) {
        logger.error('milestones.renewal_failed', {
          clientId: partner.id,
          year: due.year,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return created;
}
