import { database } from './admin';
import { seedDeliveryProject } from './rooms';

/** A delivered client whose first milestone was paid five days before it was due. */
export async function seedPaidClient(organizationId: string): Promise<{ clientId: string }> {
  const seeded = await seedDeliveryProject(organizationId);
  const sql = database();
  try {
    const [milestone] = await sql<{ id: string; contract_id: string }[]>`
      update public.billing_milestones set status = 'paid'
      where deal_id = ${seeded.dealId} and position = 1
      returning id, contract_id
    `;
    if (!milestone) throw new Error('Paid milestone was not found');
    const number = `PP-E2E-${seeded.clientId.slice(0, 8)}`;
    await sql`
      insert into public.payment_requests (organization_id, client_id, deal_id, milestone_id,
                                           number, label, amount, currency, locale, due_date,
                                           status, issuer_details, client_details, paid_at)
      values (${organizationId}, ${seeded.clientId}, ${seeded.dealId}, ${milestone.id}, ${number},
              'Assinatura', 4000, 'EUR', 'pt-PT', current_date - 5, 'paid', '{}'::jsonb,
              '{}'::jsonb, now() - interval '10 days')
    `;
    return { clientId: seeded.clientId };
  } finally {
    await sql.end();
  }
}
