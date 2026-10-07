import { inArray, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { DbContexts } from '@/platform/db';

const { applications, clients, contacts } = schema;

export const ANONYMIZED_NAME = '—';

type Expired = { id: string; organization_id: string; client_id: string; contact_id: string };

export async function anonymizeExpiredApplications(
  now: Date,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'> },
): Promise<number> {
  return deps.contexts.withSystemContext(async (tx) => {
    const expired = await tx.execute<Expired>(sql`
      select a.id, a.organization_id, a.client_id, a.contact_id
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

    await tx
      .update(applications)
      .set({ answers: {}, source: {}, anonymizedAt: now })
      .where(
        inArray(
          applications.id,
          expired.map((row) => row.id),
        ),
      );
    await tx
      .update(contacts)
      .set({ fullName: ANONYMIZED_NAME, email: null, phone: null, jobTitle: null })
      .where(
        inArray(
          contacts.id,
          expired.map((row) => row.contact_id),
        ),
      );
    await tx
      .update(clients)
      .set({ name: ANONYMIZED_NAME, website: null, taxId: null })
      .where(
        inArray(
          clients.id,
          expired.map((row) => row.client_id),
        ),
      );

    for (const row of expired) {
      await recordAudit(tx, {
        organizationId: row.organization_id,
        action: 'application.anonymized',
        resourceType: 'application',
        resourceId: row.id,
        clientId: row.client_id,
        metadata: {},
      });
    }
    return expired.length;
  });
}
