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
                                               position, label, percent, amount, currency, status)
        values (${world.organizationId}, ${clientId}, ${records.dealId}, ${records.contractId},
                ${position}, ${`Prestação ${position}`}, ${position === 1 ? 50 : 25}, 3000, 'EUR',
                ${status})
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
export async function createRoomFixture(sql: TransactionSql, world: World): Promise<RoomFixture> {
  const seed = async (clientId: string): Promise<RoomRecords> => {
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
  };

  return { a: await seed(world.clients.a), b: await seed(world.clients.b) };
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
