import { randomUUID } from 'node:crypto';
import { adminClient, database } from './admin';

export const STUDIO_SIGNER = 'Inês Duarte';
export const CLIENT_SIGNER = 'Sofia Ramos';

async function activeTemplate(
  sql: ReturnType<typeof database>,
  organizationId: string,
  kind: 'briefing' | 'orbit_grid',
): Promise<string> {
  const [template] = await sql<{ id: string }[]>`
    select id from public.core_templates
    where organization_id = ${organizationId} and kind = ${kind} and is_active
  `;
  if (!template) throw new Error(`Active ${kind} template is missing; open a Core once first`);
  return template.id;
}

/**
 * A client of its own with a decision maker in the portal, a deal at 1.6 with a Core and an
 * issuing entity, so the contract flow never collides with the shared e2e client's open deal.
 */
export async function seedContractDeal(
  organizationId: string,
): Promise<{ dealId: string; company: string; signerEmail: string }> {
  const suffix = randomUUID().slice(0, 8);
  const company = `Contrato E2E ${suffix}`;
  const signerEmail = `e2e-signer-${suffix}@e2e.agency-os.dev`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email: signerEmail,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Signer creation failed: ${error?.message}`);
  const signerId = data.user.id;

  const sql = database();
  try {
    const clientId = randomUUID();
    await sql`
      insert into public.profiles (id, full_name, kind) values (${signerId}, ${CLIENT_SIGNER}, 'client')
      on conflict (id) do update set full_name = excluded.full_name, kind = excluded.kind
    `;
    await sql`
      insert into public.clients (id, organization_id, name, lifecycle)
      values (${clientId}, ${organizationId}, ${company}, 'prospect')
    `;
    await sql`
      insert into public.client_memberships (organization_id, client_id, user_id, role, status)
      values (${organizationId}, ${clientId}, ${signerId}, 'decision_maker', 'active')
    `;
    await sql`
      insert into public.contacts (organization_id, client_id, full_name, email, role, portal_user_id)
      values (${organizationId}, ${clientId}, ${CLIENT_SIGNER}, ${signerEmail}, 'decision_maker',
              ${signerId})
    `;
    const [deal] = await sql<{ id: string }[]>`
      insert into public.deals (organization_id, client_id, title, pipeline_code, source)
      values (${organizationId}, ${clientId}, ${company}, '1.6', 'acquisition')
      returning id
    `;
    if (!deal) throw new Error('Contract deal was not created');
    await sql`
      insert into public.core_engagements (organization_id, client_id, deal_id,
                                           briefing_template_id, grid_template_id)
      values (${organizationId}, ${clientId}, ${deal.id},
              ${await activeTemplate(sql, organizationId, 'briefing')},
              ${await activeTemplate(sql, organizationId, 'orbit_grid')})
    `;
    const [entity] = await sql<{ id: string }[]>`
      select id from public.legal_entities
      where organization_id = ${organizationId} and archived_at is null
      limit 1
    `;
    if (!entity) {
      await sql`
        insert into public.legal_entities (organization_id, legal_name, tax_id, address, country,
                                           email, representative_name, representative_role,
                                           is_default)
        values (${organizationId}, 'Aurion Creative E2E, Lda', '516000000',
                'Avenida da Liberdade 1, Lisboa', 'PT', 'geral@e2e.agency-os.dev',
                ${STUDIO_SIGNER}, 'Gerente', true)
      `;
    }
    return { dealId: deal.id, company, signerEmail };
  } finally {
    await sql.end();
  }
}

export async function studioSignerName(organizationId: string): Promise<string> {
  const sql = database();
  try {
    const [entity] = await sql<{ name: string }[]>`
      select representative_name as name from public.legal_entities
      where organization_id = ${organizationId} and archived_at is null
      order by is_default desc, created_at
      limit 1
    `;
    return entity?.name ?? STUDIO_SIGNER;
  } finally {
    await sql.end();
  }
}
