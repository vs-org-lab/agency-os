import { database } from './admin';
import { seedSignedContract } from './billing';

export const RETAINER_EXTRA = 'Campanha de Natal';

/**
 * A client with a signed contract, an active project on that deal and a retainer of 2 content
 * pieces a month whose decision maker has asked for an extra campaign, waiting for its quote.
 */
export async function seedRetainerClient(
  organizationId: string,
): Promise<{ clientId: string; decisionMakerEmail: string }> {
  const seeded = await seedSignedContract(organizationId);
  const sql = database();
  try {
    const [deal] = await sql<{ clientId: string }[]>`
      update public.deals set pipeline_code = '2.9' where id = ${seeded.dealId}
      returning client_id as "clientId"
    `;
    if (!deal) throw new Error('Retainer deal was not found');
    // Only active clients have a room.
    await sql`update public.clients set lifecycle = 'active' where id = ${deal.clientId}`;
    const [project] = await sql<{ id: string }[]>`
      insert into public.projects (organization_id, client_id, deal_id, name, template_key,
                                   template_version, starts_on)
      values (${organizationId}, ${deal.clientId}, ${seeded.dealId}, 'Retainer', 'orbit', 1,
              current_date)
      returning id
    `;
    if (!project) throw new Error('Retainer project was not created');
    const [founder] = await sql<{ id: string }[]>`
      select user_id as id from public.organization_memberships
      where organization_id = ${organizationId} and role = 'founder'
      limit 1
    `;
    const [retainer] = await sql<{ id: string }[]>`
      insert into public.retainers (organization_id, client_id, project_id, tier, monthly_fee,
                                    currency, starts_on, review_on, created_by)
      values (${organizationId}, ${deal.clientId}, ${project.id}, 'Essencial', 1500, 'EUR',
              date_trunc('month', now() at time zone 'Europe/Lisbon')::date,
              (now() at time zone 'Europe/Lisbon')::date + 365, ${founder?.id ?? null})
      returning id
    `;
    if (!retainer) throw new Error('Retainer was not created');
    await sql`
      insert into public.retainer_limits (retainer_id, organization_id, client_id, kind,
                                          monthly_limit)
      values (${retainer.id}, ${organizationId}, ${deal.clientId}, 'content_pieces', 2)
    `;
    await sql`
      insert into public.retainer_extra_requests (organization_id, client_id, retainer_id, kind,
                                                  description, quantity, requested_by)
      select ${organizationId}, ${deal.clientId}, ${retainer.id}, 'campaigns', ${RETAINER_EXTRA},
             1, m.user_id
      from public.client_memberships m
      where m.client_id = ${deal.clientId} and m.role = 'decision_maker'
      limit 1
    `;
    return { clientId: deal.clientId, decisionMakerEmail: seeded.signerEmail };
  } finally {
    await sql.end();
  }
}
