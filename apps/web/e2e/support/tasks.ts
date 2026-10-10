import { randomUUID } from 'node:crypto';
import { database } from './admin';

/**
 * A client of its own with a deal and a payment already recorded as dispatched, so the outbox never
 * delivers it and no notice goes out; the studio feed reads it like any received payment.
 */
export async function seedReceivedPayment(
  organizationId: string,
): Promise<{ clientId: string; dealId: string; company: string }> {
  const suffix = randomUUID().slice(0, 8);
  const company = `Feed E2E ${suffix}`;
  const sql = database();
  try {
    const clientId = randomUUID();
    await sql`
      insert into public.clients (id, organization_id, name, lifecycle)
      values (${clientId}, ${organizationId}, ${company}, 'active')
    `;
    const [deal] = await sql<{ id: string }[]>`
      insert into public.deals (organization_id, client_id, title, pipeline_code, source)
      values (${organizationId}, ${clientId}, ${company}, '2.2', 'acquisition')
      returning id
    `;
    if (!deal) throw new Error('Feed deal was not created');
    await sql`
      insert into public.domain_events (organization_id, client_id, type, payload, status,
                                        dispatched_at)
      values (${organizationId}, ${clientId}, 'billing.payment.received',
              ${JSON.stringify({ dealId: deal.id })}::jsonb, 'dispatched', now())
    `;
    return { clientId, dealId: deal.id, company };
  } finally {
    await sql.end();
  }
}
