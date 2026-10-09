import { randomUUID } from 'node:crypto';
import { adminClient, database } from './admin';

export const BILLING_SIGNER = 'Rita Moura';

/** A minimal valid PDF document for the legal invoice upload. */
export const LEGAL_INVOICE_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

/**
 * A client of its own with a decision maker in the portal and a deal at 2.1 whose contract is
 * signed (a 50/50 plan of 8 000 EUR), as the contract flow leaves it before billing starts.
 */
export async function seedSignedContract(
  organizationId: string,
): Promise<{ dealId: string; company: string; signerEmail: string }> {
  const suffix = randomUUID().slice(0, 8);
  const company = `Faturação E2E ${suffix}`;
  const signerEmail = `e2e-billing-${suffix}@e2e.agency-os.dev`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email: signerEmail,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Decision maker creation failed: ${error?.message}`);
  const signerId = data.user.id;

  const sql = database();
  try {
    const clientId = randomUUID();
    await sql`
      insert into public.profiles (id, full_name, kind) values (${signerId}, ${BILLING_SIGNER}, 'client')
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
      values (${organizationId}, ${clientId}, ${BILLING_SIGNER}, ${signerEmail}, 'decision_maker',
              ${signerId})
    `;
    const [deal] = await sql<{ id: string }[]>`
      insert into public.deals (organization_id, client_id, title, pipeline_code, source)
      values (${organizationId}, ${clientId}, ${company}, '2.1', 'acquisition')
      returning id
    `;
    if (!deal) throw new Error('Billing deal was not created');

    let [entity] = await sql<{ id: string }[]>`
      select id from public.legal_entities
      where organization_id = ${organizationId} and archived_at is null
      order by is_default desc, created_at
      limit 1
    `;
    if (!entity) {
      [entity] = await sql<{ id: string }[]>`
        insert into public.legal_entities (organization_id, legal_name, tax_id, address, country,
                                           email, representative_name, representative_role,
                                           is_default)
        values (${organizationId}, 'Aurion Creative E2E, Lda', '516000000',
                'Avenida da Liberdade 1, Lisboa', 'PT', 'geral@e2e.agency-os.dev', 'Inês Duarte',
                'Gerente', true)
        returning id
      `;
    }
    if (!entity) throw new Error('Issuing entity was not found');
    await sql`
      update public.legal_entities
      set bank_name = 'Banco E2E', iban = 'PT50000201231234567890154', bic = 'BEXAPTPL'
      where id = ${entity.id} and iban = ''
    `;

    let [template] = await sql<{ id: string }[]>`
      select id from public.contract_templates
      where organization_id = ${organizationId} and locale = 'pt-PT' and is_active
    `;
    if (!template) {
      [template] = await sql<{ id: string }[]>`
        insert into public.contract_templates (organization_id, locale, version, body, is_active)
        values (${organizationId}, 'pt-PT', 1, '# Contrato', true)
        returning id
      `;
    }
    if (!template) throw new Error('Contract template was not found');

    const [proposal] = await sql<{ id: string }[]>`
      insert into public.proposals (organization_id, client_id, deal_id, legal_entity_id, currency,
                                    locale, valid_until, status, sent_at, accepted_at, accepted_by,
                                    client_details)
      values (${organizationId}, ${clientId}, ${deal.id}, ${entity.id}, 'EUR', 'pt-PT',
              current_date + 30, 'accepted', now(), now(), ${signerId},
              ${JSON.stringify({
                legalName: company,
                taxId: '500100200',
                address: 'Rua do Cliente 10, Porto',
                signerName: BILLING_SIGNER,
                signerRole: 'Administradora',
                signerEmail,
              })}::jsonb)
      returning id
    `;
    if (!proposal) throw new Error('Proposal was not created');
    const [option] = await sql<{ id: string }[]>`
      insert into public.proposal_options (organization_id, client_id, proposal_id, position, name,
                                           scope, one_off_amount, payment_plan)
      values (${organizationId}, ${clientId}, ${proposal.id}, 1, 'Orbit essencial',
              '[{"text":"Novo site","findingId":null}]'::jsonb, 8000,
              '[{"label":"Assinatura","percent":50},{"label":"Entrega","percent":50}]'::jsonb)
      returning id
    `;
    if (!option) throw new Error('Proposal option was not created');
    await sql`update public.proposals set accepted_option_id = ${option.id} where id = ${proposal.id}`;
    await sql`
      insert into public.contracts (organization_id, client_id, deal_id, proposal_id, option_id,
                                    template_id, legal_entity_id, locale, body, body_hash,
                                    studio_details, status, signed_at)
      select ${organizationId}, ${clientId}, ${deal.id}, ${proposal.id}, ${option.id},
             ${template.id}, e.id, 'pt-PT', '# Contrato', ${'0'.repeat(64)},
             jsonb_build_object('legalName', e.legal_name, 'taxId', e.tax_id, 'address', e.address,
                                'country', e.country, 'email', e.email,
                                'representativeName', e.representative_name,
                                'representativeRole', e.representative_role),
             'signed', now()
      from public.legal_entities e where e.id = ${entity.id}
    `;
    return { dealId: deal.id, company, signerEmail };
  } finally {
    await sql.end();
  }
}
