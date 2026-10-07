import { inArray, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { DbContexts } from '@/platform/db';

const { applications, calls, clients, contacts, deals, followUps } = schema;

export const ANONYMIZED_NAME = '—';

type ExpiredClient = { organization_id: string; client_id: string };

/**
 * Anonymizes prospects whose path C application outlived the retention period (SEC-73).
 * Personal data spreads beyond the application itself, so every application, contact, deal
 * title, call note and follow-up message of the client is cleared together.
 */
export async function anonymizeExpiredApplications(
  now: Date,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'> },
): Promise<number> {
  return deps.contexts.withSystemContext(async (tx) => {
    const expired = await tx.execute<ExpiredClient>(sql`
      select distinct a.organization_id, a.client_id
      from public.applications a
      join public.clients c on c.id = a.client_id
      left join public.commercial_settings cs on cs.organization_id = a.organization_id
      where a.anonymized_at is null
        and (a.path = 'c' or a.review_decision = 'c')
        and c.lifecycle = 'prospect'
        and a.created_at < ${now.toISOString()}::timestamptz
              - make_interval(months => coalesce(cs.anonymize_after_months, 12))
        and not exists (
          select 1 from public.deals d
          where d.client_id = a.client_id and d.pipeline_code <> 'X.4' and d.archived_at is null
        )
    `);
    if (expired.length === 0) return 0;
    const clientIds = expired.map((row) => row.client_id);

    const anonymized = await tx
      .update(applications)
      .set({ answers: {}, source: {}, anonymizedAt: now })
      .where(inArray(applications.clientId, clientIds))
      .returning({
        id: applications.id,
        organizationId: applications.organizationId,
        clientId: applications.clientId,
      });
    await tx
      .update(contacts)
      .set({ fullName: ANONYMIZED_NAME, email: null, phone: null, jobTitle: null })
      .where(inArray(contacts.clientId, clientIds));
    await tx
      .update(clients)
      .set({ name: ANONYMIZED_NAME, website: null, taxId: null })
      .where(inArray(clients.id, clientIds));
    await tx
      .update(deals)
      .set({ title: ANONYMIZED_NAME, lostReason: null, nextStep: null })
      .where(inArray(deals.clientId, clientIds));
    await tx.update(calls).set({ notes: null }).where(inArray(calls.clientId, clientIds));
    await tx
      .update(followUps)
      .set({ suggestedMessage: '' })
      .where(inArray(followUps.clientId, clientIds));

    for (const row of anonymized) {
      await recordAudit(tx, {
        organizationId: row.organizationId,
        action: 'application.anonymized',
        resourceType: 'application',
        resourceId: row.id,
        clientId: row.clientId,
        metadata: {},
      });
    }
    return anonymized.length;
  });
}
