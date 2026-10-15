import { sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { soleClientManager } from '@/modules/rooms/server';
import type { RetainersDeps } from './access';

const { retainers, tasks } = schema;

/** The review task is created this many days before the review date (RF-113, AUT-24). */
export const REVIEW_NOTICE_DAYS = 60;

/**
 * Daily sweep: each active retainer whose review date is within 60 days gets the review task for
 * the room's manager, once per review date. Returns the number of tasks created.
 */
export async function sweepRetainerReviews(
  today: string,
  deps: Pick<RetainersDeps, 'contexts'>,
): Promise<number> {
  return deps.contexts.withSystemContext(async (tx) => {
    const due = await tx.execute<{
      id: string;
      organization_id: string;
      client_id: string;
      project_id: string;
      review_on: string;
      client_name: string;
    }>(sql`
      select r.id, r.organization_id, r.client_id, r.project_id, r.review_on::text,
             c.name as client_name
      from public.retainers r
      join public.clients c on c.id = r.client_id
      where r.status = 'active'
        and r.review_on <= ${today}::date + ${REVIEW_NOTICE_DAYS}::int
        and r.review_alerted_for is distinct from r.review_on
      for update of r skip locked
    `);
    for (const retainer of due) {
      await tx.insert(tasks).values({
        organizationId: retainer.organization_id,
        clientId: retainer.client_id,
        projectId: retainer.project_id,
        title: `Rever o retainer de ${retainer.client_name}`.slice(0, 200),
        notes: `Revisão anual a ${retainer.review_on}: preparar a proposta de renovação.`,
        assigneeId: await soleClientManager(tx, retainer.client_id),
        dueOn: retainer.review_on,
      });
      await tx
        .update(retainers)
        .set({ reviewAlertedFor: retainer.review_on })
        .where(sql`${retainers.id} = ${retainer.id}::uuid`);
      await recordAudit(tx, {
        organizationId: retainer.organization_id,
        action: 'retainer.review_due',
        resourceType: 'retainer',
        resourceId: retainer.id,
        clientId: retainer.client_id,
        metadata: { reviewOn: retainer.review_on },
      });
    }
    return due.length;
  });
}
