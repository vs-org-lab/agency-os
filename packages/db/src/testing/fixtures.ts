import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';

type OrgRole = 'founder' | 'project_manager' | 'freelancer' | 'finance';
type ClientRole = 'decision_maker' | 'operational' | 'client_finance';
type MembershipStatus = 'invited' | 'active' | 'revoked';

export type World = {
  organizationId: string;
  clients: { a: string; b: string };
  users: {
    founder: string;
    manager: string;
    freelancer: string;
    finance: string;
    decisionMakerA: string;
    operationalA: string;
    clientFinanceB: string;
  };
};

export async function createAuthUser(
  sql: TransactionSql,
  input: { fullName: string; kind: 'internal' | 'client'; email?: string },
): Promise<string> {
  const userId = randomUUID();
  const email = input.email ?? `${userId}@test.agency-os.invalid`;
  await sql`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (${userId}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            ${email}, now(), now())
  `;
  await sql`
    insert into public.profiles (id, full_name, kind) values (${userId}, ${input.fullName}, ${input.kind})
  `;
  return userId;
}

export async function addOrganizationMember(
  sql: TransactionSql,
  input: { organizationId: string; userId: string; role: OrgRole; status?: MembershipStatus },
): Promise<void> {
  await sql`
    insert into public.organization_memberships (organization_id, user_id, role, status)
    values (${input.organizationId}, ${input.userId}, ${input.role}, ${input.status ?? 'active'})
  `;
}

export async function addClientMember(
  sql: TransactionSql,
  input: {
    organizationId: string;
    clientId: string;
    userId: string;
    role: ClientRole;
    status?: MembershipStatus;
  },
): Promise<void> {
  await sql`
    insert into public.client_memberships (organization_id, client_id, user_id, role, status)
    values (${input.organizationId}, ${input.clientId}, ${input.userId}, ${input.role},
            ${input.status ?? 'active'})
  `;
}

export async function assignStaff(
  sql: TransactionSql,
  input: { organizationId: string; clientId: string; userId: string },
): Promise<void> {
  await sql`
    insert into public.client_staff_assignments (organization_id, client_id, user_id)
    values (${input.organizationId}, ${input.clientId}, ${input.userId})
  `;
}

export async function createFixtureWorld(sql: TransactionSql): Promise<World> {
  const suffix = randomUUID().slice(0, 8);
  const [organization] = await sql<{ id: string }[]>`
    insert into public.organizations (name, slug) values (${`Fixture ${suffix}`}, ${`fixture-${suffix}`})
    returning id
  `;
  if (!organization) throw new Error('Fixture organization was not created');
  const organizationId = organization.id;

  const insertClient = async (name: string): Promise<string> => {
    const [client] = await sql<{ id: string }[]>`
      insert into public.clients (organization_id, name) values (${organizationId}, ${name}) returning id
    `;
    if (!client) throw new Error(`Fixture client ${name} was not created`);
    return client.id;
  };
  const clientA = await insertClient('Client A');
  const clientB = await insertClient('Client B');

  const founder = await createAuthUser(sql, { fullName: 'Founder', kind: 'internal' });
  const manager = await createAuthUser(sql, { fullName: 'Manager', kind: 'internal' });
  const freelancer = await createAuthUser(sql, { fullName: 'Freelancer', kind: 'internal' });
  const finance = await createAuthUser(sql, { fullName: 'Finance', kind: 'internal' });
  const decisionMakerA = await createAuthUser(sql, {
    fullName: 'Decision Maker A',
    kind: 'client',
  });
  const operationalA = await createAuthUser(sql, { fullName: 'Operational A', kind: 'client' });
  const clientFinanceB = await createAuthUser(sql, {
    fullName: 'Client Finance B',
    kind: 'client',
  });

  await addOrganizationMember(sql, { organizationId, userId: founder, role: 'founder' });
  await addOrganizationMember(sql, { organizationId, userId: manager, role: 'project_manager' });
  await addOrganizationMember(sql, { organizationId, userId: freelancer, role: 'freelancer' });
  await addOrganizationMember(sql, { organizationId, userId: finance, role: 'finance' });
  await assignStaff(sql, { organizationId, clientId: clientA, userId: manager });
  await assignStaff(sql, { organizationId, clientId: clientA, userId: freelancer });
  await addClientMember(sql, {
    organizationId,
    clientId: clientA,
    userId: decisionMakerA,
    role: 'decision_maker',
  });
  await addClientMember(sql, {
    organizationId,
    clientId: clientA,
    userId: operationalA,
    role: 'operational',
  });
  await addClientMember(sql, {
    organizationId,
    clientId: clientB,
    userId: clientFinanceB,
    role: 'client_finance',
  });

  return {
    organizationId,
    clients: { a: clientA, b: clientB },
    users: { founder, manager, freelancer, finance, decisionMakerA, operationalA, clientFinanceB },
  };
}

export type CommercialFixture = {
  formId: string;
  a: CommercialRecords;
  b: CommercialRecords;
};

export type CommercialRecords = {
  contactId: string;
  dealId: string;
  callId: string;
  applicationId: string;
};

async function seedCommercialRecords(
  sql: TransactionSql,
  input: { organizationId: string; clientId: string; formId: string; hostUserId: string },
): Promise<CommercialRecords> {
  const { organizationId, clientId, formId, hostUserId } = input;
  const suffix = randomUUID().slice(0, 8);
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${organizationId}, ${clientId}, 'Contact', ${`contact-${suffix}@test.agency-os.invalid`}, 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${organizationId}, ${clientId}, 'Diagnosis', '0.3', 'application')
    returning id
  `;
  if (!contact || !deal) throw new Error('Commercial fixture was not created');
  const [call] = await sql<{ id: string }[]>`
    insert into public.calls (organization_id, client_id, deal_id, contact_id, host_user_id, starts_at, ends_at)
    values (${organizationId}, ${clientId}, ${deal.id}, ${contact.id}, ${hostUserId},
            now() + interval '2 days', now() + interval '2 days 45 minutes')
    returning id
  `;
  const [application] = await sql<{ id: string }[]>`
    insert into public.applications (organization_id, client_id, contact_id, deal_id, form_id,
                                     answers, score, path, consent_at, consent_text_version)
    values (${organizationId}, ${clientId}, ${contact.id}, ${deal.id}, ${formId},
            '{}'::jsonb, 10, 'a', now(), 'v1')
    returning id
  `;
  if (!call || !application) throw new Error('Commercial fixture was not created');
  await sql`
    insert into public.follow_ups (organization_id, client_id, deal_id, call_id, due_on, sequence_day, suggested_message)
    values (${organizationId}, ${clientId}, ${deal.id}, ${call.id}, current_date, 3, 'Message')
  `;
  await sql`
    insert into public.timeline_entries (organization_id, client_id, deal_id, kind)
    values (${organizationId}, ${clientId}, ${deal.id}, 'call_booked')
  `;
  return { contactId: contact.id, dealId: deal.id, callId: call.id, applicationId: application.id };
}

export async function createCommercialFixture(
  sql: TransactionSql,
  world: World,
): Promise<CommercialFixture> {
  const [form] = await sql<{ id: string }[]>`
    insert into public.application_forms (organization_id, version, definition, is_active)
    values (${world.organizationId}, 1, '{}'::jsonb, true)
    returning id
  `;
  if (!form) throw new Error('Commercial fixture form was not created');
  const seed = (clientId: string) =>
    seedCommercialRecords(sql, {
      organizationId: world.organizationId,
      clientId,
      formId: form.id,
      hostUserId: world.users.founder,
    });
  return { formId: form.id, a: await seed(world.clients.a), b: await seed(world.clients.b) };
}

export type CoreRecords = {
  engagementId: string;
  dealId: string;
  contactId: string;
  callId: string;
  noteId: string;
  findingId: string;
  documentId: string;
  recordingId: string;
};

export type CoreFixture = {
  briefingTemplateId: string;
  gridTemplateId: string;
  a: CoreRecords;
  b: CoreRecords;
};

const FIXTURE_BRIEFING_GUIDE = {
  blocks: [1, 2, 3, 4].map((index) => ({
    id: `block_${index}`,
    title: { 'pt-PT': `Bloco ${index}`, en: `Block ${index}` },
    minutes: 15,
    goal: { 'pt-PT': 'Objetivo', en: 'Goal' },
    questions: [{ id: `block_${index}_q1`, text: { 'pt-PT': 'Pergunta', en: 'Question' } }],
  })),
};

const FIXTURE_ORBIT_GRID = {
  fronts: (['core', 'orbit', 'gravity', 'constellation'] as const).map((front) => ({
    front,
    criteria: [1, 2, 3, 4, 5].map((index) => ({
      id: `${front}_${index}`,
      name: { 'pt-PT': `Critério ${index}`, en: `Criterion ${index}` },
      observes: { 'pt-PT': 'O que se observa', en: 'What is observed' },
      maxPoints: 5,
    })),
  })),
};

export async function createCoreFixture(sql: TransactionSql, world: World): Promise<CoreFixture> {
  const commercial = await createCommercialFixture(sql, world);
  const templates = await sql<{ id: string; kind: string }[]>`
    insert into public.core_templates (organization_id, kind, version, definition, is_active)
    values
      (${world.organizationId}, 'briefing', 1, ${JSON.stringify(FIXTURE_BRIEFING_GUIDE)}::jsonb, true),
      (${world.organizationId}, 'orbit_grid', 1, ${JSON.stringify(FIXTURE_ORBIT_GRID)}::jsonb, true)
    returning id, kind::text
  `;
  const briefingTemplateId = templates.find((row) => row.kind === 'briefing')?.id;
  const gridTemplateId = templates.find((row) => row.kind === 'orbit_grid')?.id;
  if (!briefingTemplateId || !gridTemplateId) throw new Error('Core fixture templates missing');

  const seed = async (clientId: string, records: CommercialRecords): Promise<CoreRecords> => {
    const [engagement] = await sql<{ id: string }[]>`
      insert into public.core_engagements (organization_id, client_id, deal_id, briefing_template_id,
                                           grid_template_id, transcript)
      values (${world.organizationId}, ${clientId}, ${records.dealId}, ${briefingTemplateId},
              ${gridTemplateId}, 'Transcript')
      returning id
    `;
    if (!engagement) throw new Error('Core fixture engagement was not created');
    const [note] = await sql<{ id: string }[]>`
      insert into public.core_briefing_notes (organization_id, client_id, engagement_id, block_id, body)
      values (${world.organizationId}, ${clientId}, ${engagement.id}, 'block_1', 'Notes')
      returning id
    `;
    const [finding] = await sql<{ id: string }[]>`
      insert into public.core_findings (organization_id, client_id, engagement_id, front, title,
                                        evidence_kind, evidence_value, impact, effort, lane, owner)
      values (${world.organizationId}, ${clientId}, ${engagement.id}, 'orbit', 'Slow mobile site',
              'link', 'https://example.com/report', 'high', 'low', 'days_30', 'internal')
      returning id
    `;
    await sql`
      insert into public.core_scores (organization_id, client_id, engagement_id, front, criterion_id,
                                      points, justification)
      values (${world.organizationId}, ${clientId}, ${engagement.id}, 'orbit', 'orbit_1', 3, 'Evidence')
    `;
    const [document] = await sql<{ id: string }[]>`
      insert into public.documents (organization_id, client_id, deal_id, kind, title, url)
      values (${world.organizationId}, ${clientId}, ${records.dealId}, 'figma_presentation',
              'Apresentação', 'https://www.figma.com/deck/abc/Core')
      returning id
    `;
    const [recording] = await sql<{ id: string }[]>`
      insert into public.core_recordings (organization_id, client_id, engagement_id, source, status,
                                          client_track_path, studio_track_path, language,
                                          consent_by, consent_at)
      values (${world.organizationId}, ${clientId}, ${engagement.id}, 'call', 'uploaded',
              ${`${world.organizationId}/${clientId}/fixture/client.webm`},
              ${`${world.organizationId}/${clientId}/fixture/studio.webm`}, 'pt',
              ${world.users.founder}, now())
      returning id
    `;
    if (!note || !finding || !document || !recording) {
      throw new Error('Core fixture records were not created');
    }
    return {
      engagementId: engagement.id,
      dealId: records.dealId,
      contactId: records.contactId,
      callId: records.callId,
      noteId: note.id,
      findingId: finding.id,
      documentId: document.id,
      recordingId: recording.id,
    };
  };

  return {
    briefingTemplateId,
    gridTemplateId,
    a: await seed(world.clients.a, commercial.a),
    b: await seed(world.clients.b, commercial.b),
  };
}

export type ContractRecords = {
  dealId: string;
  proposalId: string;
  draftProposalId: string;
  optionId: string;
  requestId: string;
  contractId: string;
};

export type ContractFixture = {
  core: CoreFixture;
  entityId: string;
  templateId: string;
  a: ContractRecords;
  b: ContractRecords;
};

const FIXTURE_STUDIO = {
  legalName: 'Aurion Creative Lda',
  taxId: '516000000',
  address: 'Av. da Liberdade, Lisboa',
  country: 'PT',
  email: 'geral@aurion.test',
  representativeName: 'Vladimir Silva',
  representativeRole: 'Gerente',
};

const FIXTURE_PAYMENT_PLAN = [
  { label: 'Assinatura', percent: 50 },
  { label: 'Entrega', percent: 50 },
];

export async function createContractFixture(
  sql: TransactionSql,
  world: World,
): Promise<ContractFixture> {
  const core = await createCoreFixture(sql, world);
  const [entity] = await sql<{ id: string }[]>`
    insert into public.legal_entities (organization_id, legal_name, tax_id, address, country, email,
                                       representative_name, representative_role, is_default)
    values (${world.organizationId}, 'Aurion Creative Lda', '516000000', 'Av. da Liberdade, Lisboa',
            'PT', 'geral@aurion.test', 'Vladimir Silva', 'Gerente', true)
    returning id
  `;
  const [template] = await sql<{ id: string }[]>`
    insert into public.contract_templates (organization_id, locale, version, body, is_active)
    values (${world.organizationId}, 'pt-PT', 1, 'Contrato com {{cliente.denominacao}}', true)
    returning id
  `;
  if (!entity || !template) throw new Error('Contract fixture setup was not created');

  const seed = async (
    clientId: string,
    records: CoreRecords,
    requestAuthor: string,
  ): Promise<ContractRecords> => {
    const proposal = async (status: 'draft' | 'sent') => {
      const [row] = await sql<{ id: string }[]>`
        insert into public.proposals (organization_id, client_id, deal_id, legal_entity_id, currency,
                                      locale, valid_until, guarantee, status, sent_at)
        values (${world.organizationId}, ${clientId}, ${records.dealId}, ${entity.id}, 'EUR', 'pt-PT',
                current_date + 30, 'Garantia de resultado', ${status},
                ${status === 'sent' ? sql`now()` : null})
        returning id
      `;
      if (!row) throw new Error('Contract fixture proposal was not created');
      return row.id;
    };
    const proposalId = await proposal('sent');
    const draftProposalId = await proposal('draft');
    const [option] = await sql<{ id: string }[]>`
      insert into public.proposal_options (organization_id, client_id, proposal_id, position, name,
                                           summary, scope, one_off_amount, payment_plan)
      values (${world.organizationId}, ${clientId}, ${proposalId}, 1, 'Orbit essencial', 'Resumo',
              ${JSON.stringify([{ text: 'Novo site', findingId: null }])}::jsonb, 12000,
              ${JSON.stringify(FIXTURE_PAYMENT_PLAN)}::jsonb)
      returning id
    `;
    const [request] = await sql<{ id: string }[]>`
      insert into public.proposal_requests (organization_id, client_id, proposal_id, author_id, message)
      values (${world.organizationId}, ${clientId}, ${proposalId}, ${requestAuthor}, 'Mudar prazo')
      returning id
    `;
    if (!option || !request) throw new Error('Contract fixture option was not created');
    const [contract] = await sql<{ id: string }[]>`
      insert into public.contracts (organization_id, client_id, deal_id, proposal_id, option_id,
                                    template_id, legal_entity_id, locale, body, body_hash,
                                    studio_details)
      values (${world.organizationId}, ${clientId}, ${records.dealId}, ${proposalId}, ${option.id},
              ${template.id}, ${entity.id}, 'pt-PT', 'Contrato com Empresa', ${'0'.repeat(64)},
              ${JSON.stringify(FIXTURE_STUDIO)}::jsonb)
      returning id
    `;
    if (!contract) throw new Error('Contract fixture contract was not created');
    return {
      dealId: records.dealId,
      proposalId,
      draftProposalId,
      optionId: option.id,
      requestId: request.id,
      contractId: contract.id,
    };
  };

  return {
    core,
    entityId: entity.id,
    templateId: template.id,
    a: await seed(world.clients.a, core.a, world.users.decisionMakerA),
    b: await seed(world.clients.b, core.b, world.users.clientFinanceB),
  };
}
