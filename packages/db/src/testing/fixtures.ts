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

export type BillingRecords = {
  milestoneIds: [string, string, string];
  sentRequestId: string;
  voidRequestId: string;
  paidRequestId: string;
  paymentId: string;
  legalInvoiceId: string;
};

export type BillingFixture = { contracts: ContractFixture; a: BillingRecords; b: BillingRecords };

const FIXTURE_ISSUER = {
  ...FIXTURE_STUDIO,
  bankName: 'Banco Exemplo',
  iban: 'PT50000201231234567890154',
  bic: 'BEXAPTPL',
  paymentInstructions: '',
};

const FIXTURE_BILLED_CLIENT = {
  legalName: 'Empresa Cliente Lda',
  taxId: '509000000',
  address: 'Rua do Cliente, Porto',
};

const MILESTONE_TRIGGERS = ['signature', 'phase_approval', 'delivery'] as const;

/** Three milestones per client: one with a sent request, one with a voided request and one paid. */
export async function createBillingFixture(
  sql: TransactionSql,
  world: World,
): Promise<BillingFixture> {
  const contracts = await createContractFixture(sql, world);
  let sequence = 0;

  const seed = async (clientId: string, records: ContractRecords): Promise<BillingRecords> => {
    const milestone = async (position: number, status: 'pending' | 'requested' | 'paid') => {
      const [row] = await sql<{ id: string }[]>`
        insert into public.billing_milestones (organization_id, client_id, deal_id, contract_id,
                                               position, label, percent, amount, currency, status,
                                               trigger)
        values (${world.organizationId}, ${clientId}, ${records.dealId}, ${records.contractId},
                ${position}, ${`Prestação ${position}`}, ${position === 1 ? 50 : 25}, 3000, 'EUR',
                ${status}, ${MILESTONE_TRIGGERS[position - 1] ?? 'phase_approval'})
        returning id
      `;
      if (!row) throw new Error('Billing fixture milestone was not created');
      return row.id;
    };
    const request = async (milestoneId: string, status: 'sent' | 'paid' | 'void') => {
      sequence += 1;
      const [row] = await sql<{ id: string }[]>`
        insert into public.payment_requests (organization_id, client_id, deal_id, milestone_id, number,
                                             label, amount, currency, locale, due_date, status,
                                             issuer_details, client_details, paid_at, voided_at,
                                             void_reason)
        values (${world.organizationId}, ${clientId}, ${records.dealId}, ${milestoneId},
                ${`PP-2026-${String(sequence).padStart(4, '0')}`}, 'Prestação', 3000, 'EUR', 'pt-PT',
                current_date + 7, ${status}, ${JSON.stringify(FIXTURE_ISSUER)}::jsonb,
                ${JSON.stringify(FIXTURE_BILLED_CLIENT)}::jsonb,
                ${status === 'paid' ? sql`now()` : null}, ${status === 'void' ? sql`now()` : null},
                ${status === 'void' ? 'Valor errado' : null})
        returning id
      `;
      if (!row) throw new Error('Billing fixture request was not created');
      return row.id;
    };

    const first = await milestone(1, 'requested');
    const second = await milestone(2, 'pending');
    const third = await milestone(3, 'paid');
    const sentRequestId = await request(first, 'sent');
    const voidRequestId = await request(second, 'void');
    const paidRequestId = await request(third, 'paid');
    const [payment] = await sql<{ id: string }[]>`
      insert into public.payments (organization_id, client_id, request_id, amount, currency, method,
                                   reference, received_on, status, recorded_by, reconciled_at)
      values (${world.organizationId}, ${clientId}, ${paidRequestId}, 3000, 'EUR', 'bank_transfer',
              'TRF-1', current_date, 'reconciled', ${world.users.founder}, now())
      returning id
    `;
    const [invoice] = await sql<{ id: string }[]>`
      insert into public.legal_invoices (organization_id, client_id, request_id, issuer, number,
                                         issued_on, pdf_path, recorded_by)
      values (${world.organizationId}, ${clientId}, ${paidRequestId}, 'at_certified',
              ${`FR 2026/${sequence}`}, current_date, ${`${world.organizationId}/${clientId}/invoice.pdf`},
              ${world.users.founder})
      returning id
    `;
    if (!payment || !invoice) throw new Error('Billing fixture payment was not created');
    return {
      milestoneIds: [first, second, third],
      sentRequestId,
      voidRequestId,
      paidRequestId,
      paymentId: payment.id,
      legalInvoiceId: invoice.id,
    };
  };

  return {
    contracts,
    a: await seed(world.clients.a, contracts.a),
    b: await seed(world.clients.b, contracts.b),
  };
}

export type RoomRecords = {
  projectId: string;
  phaseIds: [string, string];
  visibleStepId: string;
  internalStepId: string;
  clientUpdateId: string;
  internalUpdateId: string;
  approvalId: string;
};

export type RoomFixture = { a: RoomRecords; b: RoomRecords };

/**
 * One project per client with two phases, a client-visible and an internal step, a client and an
 * internal update and a pending phase approval.
 */
async function seedRoomRecords(
  sql: TransactionSql,
  world: World,
  clientId: string,
): Promise<RoomRecords> {
  const [project] = await sql<{ id: string }[]>`
      insert into public.projects (organization_id, client_id, name, template_key, template_version,
                                   starts_on)
      values (${world.organizationId}, ${clientId}, 'Website', 'orbit', 1, current_date)
      returning id
    `;
  if (!project) throw new Error('Room fixture project was not created');
  const phase = async (position: number, status: string) => {
    const [row] = await sql<{ id: string }[]>`
        insert into public.project_phases (organization_id, client_id, project_id, position, name,
                                           requires_approval, status)
        values (${world.organizationId}, ${clientId}, ${project.id}, ${position},
                ${`Fase ${position}`}, ${position === 1}, ${status})
        returning id
      `;
    if (!row) throw new Error('Room fixture phase was not created');
    return row.id;
  };
  const first = await phase(1, 'awaiting_approval');
  const second = await phase(2, 'pending');
  const step = async (position: number, visible: boolean) => {
    const [row] = await sql<{ id: string }[]>`
        insert into public.project_steps (organization_id, client_id, project_id, phase_id, position,
                                          name, status, visible_to_client)
        values (${world.organizationId}, ${clientId}, ${project.id}, ${first}, ${position},
                ${visible ? 'Passo visível' : 'Passo interno'}, 'done', ${visible})
        returning id
      `;
    if (!row) throw new Error('Room fixture step was not created');
    return row.id;
  };
  const visibleStepId = await step(1, true);
  const internalStepId = await step(2, false);
  const update = async (visibility: 'client' | 'internal') => {
    const [row] = await sql<{ id: string }[]>`
        insert into public.project_updates (organization_id, client_id, project_id, author_id, body,
                                            visibility)
        values (${world.organizationId}, ${clientId}, ${project.id}, ${world.users.founder},
                ${visibility === 'client' ? 'Atualização para o cliente' : 'Nota interna'},
                ${visibility})
        returning id
      `;
    if (!row) throw new Error('Room fixture update was not created');
    return row.id;
  };
  const clientUpdateId = await update('client');
  const internalUpdateId = await update('internal');
  const [approval] = await sql<{ id: string }[]>`
      insert into public.approvals (organization_id, client_id, project_id, subject_type, subject_id,
                                    requested_by)
      values (${world.organizationId}, ${clientId}, ${project.id}, 'phase', ${first},
              ${world.users.founder})
      returning id
    `;
  if (!approval) throw new Error('Room fixture approval was not created');
  return {
    projectId: project.id,
    phaseIds: [first, second],
    visibleStepId,
    internalStepId,
    clientUpdateId,
    internalUpdateId,
    approvalId: approval.id,
  };
}

export async function createRoomFixture(sql: TransactionSql, world: World): Promise<RoomFixture> {
  return {
    a: await seedRoomRecords(sql, world, world.clients.a),
    b: await seedRoomRecords(sql, world, world.clients.b),
  };
}

export type TaskFixture = {
  clientATaskId: string;
  clientBTaskId: string;
  studioTaskId: string;
  /** A client B task assigned to the freelancer, who is assigned only to client A. */
  freelancerTaskId: string;
  itemId: string;
};

export async function createTaskFixture(sql: TransactionSql, world: World): Promise<TaskFixture> {
  const task = async (clientId: string | null, title: string, assigneeId: string | null) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.tasks (organization_id, client_id, title, assignee_id, due_on, created_by)
      values (${world.organizationId}, ${clientId}, ${title}, ${assigneeId}, current_date,
              ${world.users.founder})
      returning id
    `;
    if (!row) throw new Error('Task fixture task was not created');
    return row.id;
  };
  const clientATaskId = await task(world.clients.a, 'Rever o mapa', null);
  const clientBTaskId = await task(world.clients.b, 'Preparar proposta', null);
  const studioTaskId = await task(null, 'Atualizar o portfólio', null);
  const freelancerTaskId = await task(
    world.clients.b,
    'Exportar ficheiros',
    world.users.freelancer,
  );
  const [item] = await sql<{ id: string }[]>`
    insert into public.task_items (organization_id, task_id, position, title)
    values (${world.organizationId}, ${clientATaskId}, 1, 'Ler o feedback')
    returning id
  `;
  if (!item) throw new Error('Task fixture item was not created');
  return { clientATaskId, clientBTaskId, studioTaskId, freelancerTaskId, itemId: item.id };
}

export type TeamFixture = {
  rooms: RoomFixture;
  /** A second project of client A, with its own rows, that the freelancer is not assigned to. */
  other: RoomRecords;
  assignedTaskId: string;
  otherTaskId: string;
};

/**
 * Client A with two projects; the freelancer (assigned to client A) is assigned only to the first.
 * Each project has a task, and the freelancer has a rates row.
 */
export async function createTeamFixture(sql: TransactionSql, world: World): Promise<TeamFixture> {
  const rooms = await createRoomFixture(sql, world);
  const other = await seedRoomRecords(sql, world, world.clients.a);
  await sql`
    insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
    values (${world.organizationId}, ${world.clients.a}, ${rooms.a.projectId},
            ${world.users.freelancer})
  `;
  const task = async (projectId: string, title: string) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.tasks (organization_id, client_id, project_id, title, created_by)
      values (${world.organizationId}, ${world.clients.a}, ${projectId}, ${title},
              ${world.users.founder})
      returning id
    `;
    if (!row) throw new Error('Team fixture task was not created');
    return row.id;
  };
  const assignedTaskId = await task(rooms.a.projectId, 'Tarefa do projeto atribuído');
  const otherTaskId = await task(other.projectId, 'Tarefa do outro projeto');
  await sql`
    insert into public.team_member_rates (organization_id, user_id, hourly_cost, currency,
                                          weekly_hours)
    values (${world.organizationId}, ${world.users.freelancer}, 35, 'EUR', 20)
  `;
  return { rooms, other, assignedTaskId, otherTaskId };
}

export type ProofFixture = {
  rooms: RoomFixture;
  fileId: string;
  /** Ready, never sent for approval. */
  versionOneId: string;
  /** Ready, with a pending approval. */
  versionTwoId: string;
  approvalId: string;
  clientCommentId: string;
  internalCommentId: string;
};

/** A proof in client A's project with two image versions, the second sent for approval. */
export async function createProofFixture(sql: TransactionSql, world: World): Promise<ProofFixture> {
  const rooms = await createRoomFixture(sql, world);
  const { projectId } = rooms.a;
  const [file] = await sql<{ id: string }[]>`
    insert into public.proof_files (organization_id, client_id, project_id, title, created_by)
    values (${world.organizationId}, ${world.clients.a}, ${projectId}, 'Logótipo',
            ${world.users.founder})
    returning id
  `;
  if (!file) throw new Error('Proof fixture file was not created');
  const version = async (number: number) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.proof_versions (organization_id, client_id, project_id, file_id, number,
                                         storage_path, kind, mime_type, size_bytes, status,
                                         uploaded_by)
      values (${world.organizationId}, ${world.clients.a}, ${projectId}, ${file.id}, ${number},
              ${`fixture/${file.id}/${number}`}, 'image', 'image/png', 1024, 'ready',
              ${world.users.founder})
      returning id
    `;
    if (!row) throw new Error('Proof fixture version was not created');
    return row.id;
  };
  const versionOneId = await version(1);
  const versionTwoId = await version(2);
  const [approval] = await sql<{ id: string }[]>`
    insert into public.approvals (organization_id, client_id, project_id, subject_type, subject_id,
                                  requested_by)
    values (${world.organizationId}, ${world.clients.a}, ${projectId}, 'file_version',
            ${versionTwoId}, ${world.users.founder})
    returning id
  `;
  if (!approval) throw new Error('Proof fixture approval was not created');
  const comment = async (authorId: string, body: string, internal: boolean, number: number) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.proof_comments (organization_id, client_id, project_id, version_id,
                                         author_id, body, anchor, number, internal)
      values (${world.organizationId}, ${world.clients.a}, ${projectId}, ${versionTwoId},
              ${authorId}, ${body}, ${JSON.stringify({ type: 'point', x: 40, y: 60 })}::jsonb,
              ${number}, ${internal})
      returning id
    `;
    if (!row) throw new Error('Proof fixture comment was not created');
    return row.id;
  };
  const clientCommentId = await comment(world.users.decisionMakerA, 'Mais contraste', false, 1);
  const internalCommentId = await comment(world.users.founder, 'Rever com o designer', true, 2);
  return {
    rooms,
    fileId: file.id,
    versionOneId,
    versionTwoId,
    approvalId: approval.id,
    clientCommentId,
    internalCommentId,
  };
}

export type LibraryRecords = {
  projectId: string;
  /** Visible root "Marca". */
  rootId: string;
  /** "Logótipos", inside "Marca". */
  subfolderId: string;
  /** Internal root "Interno". */
  internalId: string;
  rootFileId: string;
  subfolderFileId: string;
  internalFileId: string;
  /** A file under "Marca" still uploading. */
  uploadingFileId: string;
};

export type LibraryFixture = {
  rooms: RoomFixture;
  a: LibraryRecords;
  b: Pick<LibraryRecords, 'projectId' | 'rootId' | 'rootFileId'>;
};

async function seedLibraryFolder(
  sql: TransactionSql,
  world: World,
  scope: { clientId: string; projectId: string },
  input: { name: string; parent: { id: string; rootId: string; depth: number } | null },
): Promise<string> {
  const folderId = randomUUID();
  await sql`
    insert into public.library_folders (id, organization_id, client_id, project_id, parent_id,
                                        root_id, depth, name, visibility, created_by)
    values (${folderId}, ${world.organizationId}, ${scope.clientId}, ${scope.projectId},
            ${input.parent?.id ?? null}, ${input.parent?.rootId ?? folderId},
            ${input.parent ? input.parent.depth + 1 : 0}, ${input.name},
            ${input.parent ? null : 'internal'}, ${world.users.founder})
  `;
  return folderId;
}

async function seedLibraryFile(
  sql: TransactionSql,
  world: World,
  scope: { clientId: string; projectId: string },
  input: { folderId: string; rootId: string; name: string; status?: 'ready' | 'uploading' },
): Promise<string> {
  const fileId = randomUUID();
  const ready = (input.status ?? 'ready') === 'ready';
  await sql`
    insert into public.library_files (id, organization_id, client_id, project_id, folder_id,
                                      root_id, name, storage_path, kind, mime_type, size_bytes,
                                      status, uploaded_by)
    values (${fileId}, ${world.organizationId}, ${scope.clientId}, ${scope.projectId},
            ${input.folderId}, ${input.rootId}, ${input.name},
            ${`${world.organizationId}/${scope.clientId}/${scope.projectId}/${fileId}`},
            ${ready ? 'image' : null}, ${ready ? 'image/png' : null}, ${ready ? 2048 : null},
            ${input.status ?? 'ready'}, ${world.users.founder})
  `;
  return fileId;
}

/**
 * Client A's project library: the visible root "Marca" with the subfolder "Logótipos", a file in
 * each and one still uploading, and the internal root "Interno" with a file; client B has a
 * visible root with a file.
 */
export async function createLibraryFixture(
  sql: TransactionSql,
  world: World,
): Promise<LibraryFixture> {
  const rooms = await createRoomFixture(sql, world);
  const scopeA = { clientId: world.clients.a, projectId: rooms.a.projectId };
  const scopeB = { clientId: world.clients.b, projectId: rooms.b.projectId };
  const rootId = await seedLibraryFolder(sql, world, scopeA, { name: 'Marca', parent: null });
  const subfolderId = await seedLibraryFolder(sql, world, scopeA, {
    name: 'Logótipos',
    parent: { id: rootId, rootId, depth: 0 },
  });
  const internalId = await seedLibraryFolder(sql, world, scopeA, { name: 'Interno', parent: null });
  const rootB = await seedLibraryFolder(sql, world, scopeB, { name: 'Marca', parent: null });
  await sql`
    update public.library_folders set visibility = 'client' where id in (${rootId}, ${rootB})
  `;
  return {
    rooms,
    a: {
      projectId: rooms.a.projectId,
      rootId,
      subfolderId,
      internalId,
      rootFileId: await seedLibraryFile(sql, world, scopeA, {
        folderId: rootId,
        rootId,
        name: 'manual.png',
      }),
      subfolderFileId: await seedLibraryFile(sql, world, scopeA, {
        folderId: subfolderId,
        rootId,
        name: 'logo.png',
      }),
      internalFileId: await seedLibraryFile(sql, world, scopeA, {
        folderId: internalId,
        rootId: internalId,
        name: 'notas.png',
      }),
      uploadingFileId: await seedLibraryFile(sql, world, scopeA, {
        folderId: rootId,
        rootId,
        name: 'pendente.png',
        status: 'uploading',
      }),
    },
    b: {
      projectId: rooms.b.projectId,
      rootId: rootB,
      rootFileId: await seedLibraryFile(sql, world, scopeB, {
        folderId: rootB,
        rootId: rootB,
        name: 'marca-b.png',
      }),
    },
  };
}

export type DocumentRecords = {
  projectId: string;
  /** A link document in draft. */
  draftId: string;
  draftVersionId: string;
  /** A PDF with the client: version 1 shared, version 2 ready but created after sharing. */
  sharedId: string;
  sharedV1Id: string;
  sharedV2Id: string;
  /** A Figma document approved on version 1. */
  approvedId: string;
  approvedVersionId: string;
  publicCommentId: string;
  internalCommentId: string;
};

export type DocumentFixture = {
  rooms: RoomFixture;
  a: DocumentRecords;
  b: { projectId: string; documentId: string; versionId: string };
};

type DocumentScope = { clientId: string; projectId: string };

async function seedDocument(
  sql: TransactionSql,
  world: World,
  scope: DocumentScope,
  input: {
    title: string;
    kind: 'figma' | 'pdf' | 'file' | 'link';
    status: 'draft' | 'with_client' | 'approved';
  },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.project_documents (organization_id, client_id, project_id, title, kind,
                                          status, shared_at, approved_at, created_by)
    values (${world.organizationId}, ${scope.clientId}, ${scope.projectId}, ${input.title},
            ${input.kind}, ${input.status},
            case when ${input.status} = 'draft' then null else now() end,
            case when ${input.status} = 'approved' then now() end, ${world.users.founder})
    returning id
  `;
  if (!row) throw new Error('Fixture document was not created');
  return row.id;
}

async function seedDocumentVersion(
  sql: TransactionSql,
  world: World,
  scope: DocumentScope,
  input: { documentId: string; number: number; kind: 'figma' | 'pdf' | 'link'; shared: boolean },
): Promise<string> {
  const file = input.kind === 'pdf';
  const url =
    input.kind === 'figma'
      ? 'https://www.figma.com/design/AbC123/Estrategia'
      : input.kind === 'link'
        ? 'https://example.com/briefing'
        : null;
  const [row] = await sql<{ id: string }[]>`
    insert into public.project_document_versions (document_id, organization_id, client_id,
                                                  project_id, number, kind, url, storage_path,
                                                  file_name, mime_type, size_bytes, pages,
                                                  shared_at, created_by)
    values (${input.documentId}, ${world.organizationId}, ${scope.clientId}, ${scope.projectId},
            ${input.number}, ${input.kind}, ${url},
            ${file ? `documents/fixture/${input.documentId}/${input.number}` : null},
            ${file ? `estrategia-v${input.number}.pdf` : null},
            ${file ? 'application/pdf' : null}, ${file ? 4096 : null}, ${file ? 2 : null},
            case when ${input.shared} then now() end, ${world.users.founder})
    returning id
  `;
  if (!row) throw new Error('Fixture document version was not created');
  await sql`
    update public.project_documents set current_version_id = ${row.id}
    where id = ${input.documentId}
  `;
  return row.id;
}

/**
 * Client A's project documents: a link in draft, a PDF with the client whose second version was
 * created after sharing, and an approved Figma document, with a public and an internal comment
 * on the PDF; client B has one shared document.
 */
export async function createDocumentFixture(
  sql: TransactionSql,
  world: World,
): Promise<DocumentFixture> {
  const rooms = await createRoomFixture(sql, world);
  const scopeA = { clientId: world.clients.a, projectId: rooms.a.projectId };
  const scopeB = { clientId: world.clients.b, projectId: rooms.b.projectId };

  const draftId = await seedDocument(sql, world, scopeA, {
    title: 'Briefing',
    kind: 'link',
    status: 'draft',
  });
  const draftVersionId = await seedDocumentVersion(sql, world, scopeA, {
    documentId: draftId,
    number: 1,
    kind: 'link',
    shared: false,
  });
  const sharedId = await seedDocument(sql, world, scopeA, {
    title: 'Estratégia',
    kind: 'pdf',
    status: 'with_client',
  });
  const sharedV1Id = await seedDocumentVersion(sql, world, scopeA, {
    documentId: sharedId,
    number: 1,
    kind: 'pdf',
    shared: true,
  });
  const sharedV2Id = await seedDocumentVersion(sql, world, scopeA, {
    documentId: sharedId,
    number: 2,
    kind: 'pdf',
    shared: false,
  });
  await sql`
    update public.project_documents set current_version_id = ${sharedV1Id} where id = ${sharedId}
  `;
  const approvedId = await seedDocument(sql, world, scopeA, {
    title: 'Apresentação',
    kind: 'figma',
    status: 'approved',
  });
  const approvedVersionId = await seedDocumentVersion(sql, world, scopeA, {
    documentId: approvedId,
    number: 1,
    kind: 'figma',
    shared: true,
  });
  await sql`
    update public.project_documents set approved_version_id = ${approvedVersionId}
    where id = ${approvedId}
  `;
  const comment = async (authorId: string, body: string, internal: boolean) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.project_document_comments (document_id, version_id, organization_id,
                                                    client_id, project_id, author_id, body,
                                                    internal)
      values (${sharedId}, ${sharedV1Id}, ${world.organizationId}, ${world.clients.a},
              ${rooms.a.projectId}, ${authorId}, ${body}, ${internal})
      returning id
    `;
    if (!row) throw new Error('Fixture document comment was not created');
    return row.id;
  };
  const publicCommentId = await comment(world.users.decisionMakerA, 'Falta a página 3', false);
  const internalCommentId = await comment(world.users.founder, 'Rever antes de responder', true);

  const documentB = await seedDocument(sql, world, scopeB, {
    title: 'Estratégia B',
    kind: 'link',
    status: 'with_client',
  });
  const versionB = await seedDocumentVersion(sql, world, scopeB, {
    documentId: documentB,
    number: 1,
    kind: 'link',
    shared: true,
  });
  return {
    rooms,
    a: {
      projectId: rooms.a.projectId,
      draftId,
      draftVersionId,
      sharedId,
      sharedV1Id,
      sharedV2Id,
      approvedId,
      approvedVersionId,
      publicCommentId,
      internalCommentId,
    },
    b: { projectId: rooms.b.projectId, documentId: documentB, versionId: versionB },
  };
}

export type DeliveryFixture = {
  contracts: ContractFixture;
  dealId: string;
  contractId: string;
  projectId: string;
  /** Requires approval, done and approved. */
  approvalPhaseId: string;
  /** No approval, done. */
  finalPhaseId: string;
  phaseApprovalId: string;
  /** 40% at signature (requested), 30% on the approval phase (pending), 30% at delivery (pending). */
  milestoneIds: { signature: string; phase: string; delivery: string };
};

/**
 * Client A's deal at 2.9 with a signed contract, its three milestones and a completed project
 * whose two phases are done: the state right before the final approval.
 */
export async function createDeliveryFixture(
  sql: TransactionSql,
  world: World,
): Promise<DeliveryFixture> {
  const contracts = await createContractFixture(sql, world);
  const { dealId, contractId } = contracts.a;
  const clientId = world.clients.a;
  await sql`
    update public.legal_entities
    set bank_name = 'Banco Exemplo', iban = 'PT50000201231234567890154', bic = 'BEXAPTPL'
    where id = ${contracts.entityId}
  `;
  await sql`
    update public.proposals
    set status = 'accepted', accepted_at = now(), accepted_by = ${world.users.decisionMakerA},
        accepted_option_id = ${contracts.a.optionId},
        client_details = ${JSON.stringify(FIXTURE_BILLED_CLIENT)}::jsonb
    where id = ${contracts.a.proposalId}
  `;
  await sql`
    update public.contracts set status = 'signed', signed_at = now() where id = ${contractId}
  `;
  await sql`update public.deals set pipeline_code = '2.9' where id = ${dealId}`;
  const [project] = await sql<{ id: string }[]>`
    insert into public.projects (organization_id, client_id, deal_id, name, template_key,
                                 template_version, starts_on, status)
    values (${world.organizationId}, ${clientId}, ${dealId}, 'Website', 'orbit', 1, current_date,
            'completed')
    returning id
  `;
  if (!project) throw new Error('Delivery fixture project was not created');
  const phase = async (position: number, requiresApproval: boolean) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.project_phases (organization_id, client_id, project_id, position, name,
                                         requires_approval, status, completed_at)
      values (${world.organizationId}, ${clientId}, ${project.id}, ${position},
              ${`Fase ${position}`}, ${requiresApproval}, 'done', now())
      returning id
    `;
    if (!row) throw new Error('Delivery fixture phase was not created');
    return row.id;
  };
  const approvalPhaseId = await phase(1, true);
  const finalPhaseId = await phase(2, false);
  const [approval] = await sql<{ id: string }[]>`
    insert into public.approvals (organization_id, client_id, project_id, subject_type, subject_id,
                                  status, requested_by, decided_by, decided_at)
    values (${world.organizationId}, ${clientId}, ${project.id}, 'phase', ${approvalPhaseId},
            'approved', ${world.users.founder}, ${world.users.decisionMakerA}, now())
    returning id
  `;
  if (!approval) throw new Error('Delivery fixture approval was not created');
  const milestone = async (
    position: number,
    percent: number,
    trigger: 'signature' | 'phase_approval' | 'delivery',
    status: 'pending' | 'requested',
    phaseId: string | null,
  ) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.billing_milestones (organization_id, client_id, deal_id, contract_id,
                                             position, label, percent, amount, currency, status,
                                             trigger, phase_id)
      values (${world.organizationId}, ${clientId}, ${dealId}, ${contractId}, ${position},
              ${`Prestação ${position}`}, ${percent}, ${percent * 120}, 'EUR', ${status},
              ${trigger}, ${phaseId})
      returning id
    `;
    if (!row) throw new Error('Delivery fixture milestone was not created');
    return row.id;
  };
  return {
    contracts,
    dealId,
    contractId,
    projectId: project.id,
    approvalPhaseId,
    finalPhaseId,
    phaseApprovalId: approval.id,
    milestoneIds: {
      signature: await milestone(1, 40, 'signature', 'requested', null),
      phase: await milestone(2, 30, 'phase_approval', 'pending', approvalPhaseId),
      delivery: await milestone(3, 30, 'delivery', 'pending', null),
    },
  };
}

export type BrandHubFixture = {
  rooms: RoomFixture;
  a: {
    hubId: string;
    pageIds: Record<string, string>;
    strategyBlockId: string;
    logoBlockId: string;
    logoAssetId: string;
    draftAssetId: string;
    publicationId: string;
  };
  b: { hubId: string };
};

const BRAND_HUB_PAGES = [
  ['strategy', 'Estratégia'],
  ['gallery', 'Galeria'],
  ['logo', 'Logótipo'],
  ['typography', 'Tipografia'],
  ['color', 'Cor'],
  ['photography', 'Fotografia'],
  ['layout', 'Layout'],
  ['brand_objects', 'Objetos de marca'],
  ['resources', 'Recursos'],
] as const;

async function seedBrandHub(
  sql: TransactionSql,
  world: World,
  clientId: string,
): Promise<{ hubId: string; pageIds: Record<string, string> }> {
  const [hub] = await sql<{ id: string }[]>`
    insert into public.brand_hubs (organization_id, client_id, slug, created_by)
    values (${world.organizationId}, ${clientId},
            ${clientId === world.clients.a ? 'cliente-a' : 'cliente-b'}, ${world.users.founder})
    returning id
  `;
  if (!hub) throw new Error('Fixture brand hub was not created');
  const pageIds: Record<string, string> = {};
  for (const [index, [key, title]] of BRAND_HUB_PAGES.entries()) {
    const [page] = await sql<{ id: string }[]>`
      insert into public.brand_hub_pages (hub_id, organization_id, client_id, kind, standard_key,
                                          title, position)
      values (${hub.id}, ${world.organizationId}, ${clientId}, 'standard', ${key}, ${title},
              ${index + 1})
      returning id
    `;
    if (!page) throw new Error('Fixture brand hub page was not created');
    pageIds[key] = page.id;
  }
  return { hubId: hub.id, pageIds };
}

/**
 * Client A has a hub published once, with a filled strategy block and a logo, then edited: a new
 * asset exists only in the draft. Client B has a hub that was never published.
 */
export async function createBrandHubFixture(
  sql: TransactionSql,
  world: World,
): Promise<BrandHubFixture> {
  const rooms = await createRoomFixture(sql, world);
  const { hubId, pageIds } = await seedBrandHub(sql, world, world.clients.a);
  const asset = async (name: string, mimeType: string) => {
    const assetId = randomUUID();
    await sql`
      insert into public.brand_hub_assets (id, hub_id, organization_id, client_id, name, mime_type,
                                           size_bytes, storage_path, upload_status, created_by)
      values (${assetId}, ${hubId}, ${world.organizationId}, ${world.clients.a}, ${name},
              ${mimeType}, 2048,
              ${`brand-hub/${world.organizationId}/${world.clients.a}/${assetId}`}, 'ready',
              ${world.users.founder})
    `;
    return assetId;
  };
  const block = async (pageId: string, type: string, content: unknown) => {
    const [row] = await sql<{ id: string }[]>`
      insert into public.brand_hub_blocks (page_id, hub_id, organization_id, client_id, type,
                                           position, content)
      values (${pageId}, ${hubId}, ${world.organizationId}, ${world.clients.a}, ${type}, 1,
              ${JSON.stringify(content)}::text::jsonb)
      returning id
    `;
    if (!row) throw new Error('Fixture brand hub block was not created');
    return row.id;
  };
  const strategy = {
    story: 'Nasceu numa oficina.',
    mission: 'Dar forma a marcas honestas.',
    vision: '',
    values: '',
    voice: '',
    positioning: '',
  };
  const strategyBlockId = await block(pageIds.strategy as string, 'strategy', strategy);
  const logoAssetId = await asset('logo.svg', 'image/svg+xml');
  const logo = { assetId: logoAssetId, variant: 'Principal', background: 'light' };
  const logoBlockId = await block(pageIds.logo as string, 'logo', logo);
  const snapshot = {
    design: {
      colors: {
        surface: '#FFFFFF',
        panel: '#F5F5F4',
        text: '#1C1917',
        textMuted: '#57534E',
        accent: '#1C1917',
        divider: '#E7E5E4',
      },
      corners: 'soft',
      logoTiles: true,
      layout: 'sidebar',
    },
    pages: [
      {
        id: pageIds.strategy,
        number: '01',
        title: 'Estratégia',
        standardKey: 'strategy',
        blocks: [{ id: strategyBlockId, type: 'strategy', content: strategy }],
      },
      {
        id: pageIds.logo,
        number: '02',
        title: 'Logótipo',
        standardKey: 'logo',
        blocks: [{ id: logoBlockId, type: 'logo', content: logo }],
      },
    ],
    assets: [{ id: logoAssetId, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 2048 }],
  };
  const [publication] = await sql<{ id: string }[]>`
    insert into public.brand_hub_publications (hub_id, organization_id, client_id, number,
                                               revision, snapshot, published_by)
    values (${hubId}, ${world.organizationId}, ${world.clients.a}, 1, 1,
            ${JSON.stringify(snapshot)}::text::jsonb, ${world.users.founder})
    returning id
  `;
  if (!publication) throw new Error('Fixture brand hub publication was not created');
  const draftAssetId = await asset('draft.png', 'image/png');
  await sql`
    update public.brand_hubs
    set published_publication_id = ${publication.id}, draft_revision = 2
    where id = ${hubId}
  `;
  const hubB = await seedBrandHub(sql, world, world.clients.b);
  return {
    rooms,
    a: {
      hubId,
      pageIds,
      strategyBlockId,
      logoBlockId,
      logoAssetId,
      draftAssetId,
      publicationId: publication.id,
    },
    b: { hubId: hubB.hubId },
  };
}

/** The instant agenda fixtures and tests are written against. */
export const AGENDA_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export type AgendaFixture = {
  rooms: RoomFixture;
  internalId: string;
  kickoffAId: string;
  meetingBId: string;
  cancelledAId: string;
};

/**
 * An internal meeting, a kickoff on client A's project, a meeting with client B and a cancelled
 * meeting with client A, all a day after AGENDA_TEST_NOW.
 */
export async function createAgendaFixture(
  sql: TransactionSql,
  world: World,
): Promise<AgendaFixture> {
  const rooms = await createRoomFixture(sql, world);
  const tomorrow = new Date(AGENDA_TEST_NOW.getTime() + 24 * 60 * 60 * 1000);
  const meeting = async (input: {
    kind: string;
    clientId: string | null;
    projectId: string | null;
    title: string;
    hour: number;
    status?: string;
  }) => {
    const startsAt = new Date(tomorrow.getTime() + input.hour * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const [row] = await sql<{ id: string }[]>`
      insert into public.agenda_events (organization_id, client_id, project_id, kind, title,
                                        starts_at, ends_at, status, created_by)
      values (${world.organizationId}, ${input.clientId}, ${input.projectId}, ${input.kind},
              ${input.title}, ${startsAt.toISOString()}, ${endsAt.toISOString()},
              ${input.status ?? 'scheduled'}, ${world.users.founder})
      returning id
    `;
    if (!row) throw new Error('Fixture agenda event was not created');
    return row.id;
  };
  return {
    rooms,
    internalId: await meeting({
      kind: 'internal',
      clientId: null,
      projectId: null,
      title: 'Planeamento',
      hour: 0,
    }),
    kickoffAId: await meeting({
      kind: 'kickoff',
      clientId: world.clients.a,
      projectId: rooms.a.projectId,
      title: 'Kickoff',
      hour: 2,
    }),
    meetingBId: await meeting({
      kind: 'meeting',
      clientId: world.clients.b,
      projectId: null,
      title: 'Reunião B',
      hour: 4,
    }),
    cancelledAId: await meeting({
      kind: 'meeting',
      clientId: world.clients.a,
      projectId: null,
      title: 'Cancelada',
      hour: 6,
      status: 'cancelled',
    }),
  };
}

export type MoneyFixture = {
  billing: BillingFixture;
  a: { expenseId: string };
  b: { expenseId: string };
  internalExpenseId: string;
  subscriptionId: string;
};

/**
 * One billable expense per client, linked to its sent request with a receipt, one internal expense
 * without client and one subscription.
 */
export async function createMoneyFixture(sql: TransactionSql, world: World): Promise<MoneyFixture> {
  const billing = await createBillingFixture(sql, world);
  const [subscription] = await sql<{ id: string }[]>`
    insert into public.subscriptions (organization_id, name, vendor, category, amount, currency,
                                      cycle, next_renewal_on, created_by)
    values (${world.organizationId}, 'Figma', 'Figma Inc', 'software', 45, 'EUR', 'monthly',
            '2026-11-01', ${world.users.founder})
    returning id
  `;
  const expense = async (clientId: string | null, requestId: string | null) => {
    const receipt = clientId ? `money/${world.organizationId}/receipts/${randomUUID()}` : null;
    const [row] = await sql<{ id: string }[]>`
      insert into public.expenses (organization_id, spent_on, vendor, description, category, amount,
                                   currency, receipt_path, receipt_name, receipt_mime_type,
                                   client_id, payment_request_id, created_by)
      values (${world.organizationId}, '2026-10-01', 'Gráfica Lda', 'Impressão', 'other', 120, 'EUR',
              ${receipt}, ${receipt ? 'recibo.png' : null}, ${receipt ? 'image/png' : null},
              ${clientId}, ${requestId}, ${world.users.founder})
      returning id
    `;
    if (!row) throw new Error('Money fixture expense was not created');
    return row.id;
  };
  if (!subscription) throw new Error('Money fixture subscription was not created');
  return {
    billing,
    a: { expenseId: await expense(world.clients.a, billing.a.sentRequestId) },
    b: { expenseId: await expense(world.clients.b, billing.b.sentRequestId) },
    internalExpenseId: await expense(null, null),
    subscriptionId: subscription.id,
  };
}
