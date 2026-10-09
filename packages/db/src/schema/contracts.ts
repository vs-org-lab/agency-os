import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { deals } from './deals';
import {
  contractStatusEnum,
  countryCodeEnum,
  currencyEnum,
  localeEnum,
  proposalStatusEnum,
  signaturePartyEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export type ProposalScopeLine = { text: string; findingId: string | null };

export type PaymentStep = { label: string; percent: number };

export type ProposalClientDetails = {
  legalName: string;
  taxId: string;
  address: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
};

/** The studio party as it stood when the contract was generated. */
export type ContractStudioDetails = {
  legalName: string;
  taxId: string;
  address: string;
  country: 'PT' | 'AO';
  email: string;
  representativeName: string;
  representativeRole: string;
};

export const legalEntities = pgTable(
  'legal_entities',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    legalName: text('legal_name').notNull(),
    taxId: text('tax_id').notNull(),
    address: text('address').notNull(),
    country: countryCodeEnum('country').notNull(),
    email: text('email').notNull(),
    representativeName: text('representative_name').notNull(),
    representativeRole: text('representative_role').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    unique('legal_entities_id_organization_id_key').on(table.id, table.organizationId),
    uniqueIndex('legal_entities_default_key')
      .on(table.organizationId)
      .where(sql`${table.isDefault} and ${table.archivedAt} is null`),
  ],
).enableRLS();

export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    locale: localeEnum('locale').notNull(),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    publishedBy: uuid('published_by').references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('contract_templates_version_key').on(table.organizationId, table.locale, table.version),
    uniqueIndex('contract_templates_active_key')
      .on(table.organizationId, table.locale)
      .where(sql`${table.isActive}`),
  ],
).enableRLS();

export const proposals = pgTable(
  'proposals',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    legalEntityId: uuid('legal_entity_id').notNull(),
    currency: currencyEnum('currency').notNull(),
    locale: localeEnum('locale').notNull(),
    validUntil: date('valid_until').notNull(),
    guarantee: text('guarantee').notNull().default(''),
    status: proposalStatusEnum('status').notNull().default('draft'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => profiles.id, { onDelete: 'restrict' }),
    acceptedOptionId: uuid('accepted_option_id'),
    clientDetails: jsonb('client_details').$type<ProposalClientDetails>(),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'proposals_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'proposals_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.legalEntityId, table.organizationId],
      foreignColumns: [legalEntities.id, legalEntities.organizationId],
      name: 'proposals_legal_entity_organization_fk',
    }).onDelete('restrict'),
    unique('proposals_id_client_id_key').on(table.id, table.clientId),
    index('proposals_deal_idx').on(table.dealId, table.createdAt),
  ],
).enableRLS();

export const proposalOptions = pgTable(
  'proposal_options',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    proposalId: uuid('proposal_id').notNull(),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    scope: jsonb('scope').$type<ProposalScopeLine[]>().notNull(),
    oneOffAmount: numeric('one_off_amount', { precision: 12, scale: 2 }).notNull(),
    paymentPlan: jsonb('payment_plan').$type<PaymentStep[]>().notNull(),
    retainerMonthly: numeric('retainer_monthly', { precision: 12, scale: 2 }),
    retainerMonths: integer('retainer_months'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.proposalId, table.clientId],
      foreignColumns: [proposals.id, proposals.clientId],
      name: 'proposal_options_proposal_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'proposal_options_client_organization_fk',
    }).onDelete('restrict'),
    unique('proposal_options_position_key').on(table.proposalId, table.position),
    unique('proposal_options_id_proposal_id_key').on(table.id, table.proposalId),
    check('proposal_options_position_range', sql`${table.position} between 1 and 3`),
    check(
      'proposal_options_retainer_shape',
      sql`(${table.retainerMonthly} is null and ${table.retainerMonths} is null)
        or (${table.retainerMonthly} > 0 and ${table.retainerMonths} between 1 and 36)`,
    ),
  ],
).enableRLS();

export const proposalRequests = pgTable(
  'proposal_requests',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    proposalId: uuid('proposal_id').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.proposalId, table.clientId],
      foreignColumns: [proposals.id, proposals.clientId],
      name: 'proposal_requests_proposal_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'proposal_requests_client_organization_fk',
    }).onDelete('restrict'),
  ],
).enableRLS();

export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    proposalId: uuid('proposal_id').notNull(),
    optionId: uuid('option_id').notNull(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => contractTemplates.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id').notNull(),
    locale: localeEnum('locale').notNull(),
    body: text('body').notNull(),
    bodyHash: text('body_hash').notNull(),
    studioDetails: jsonb('studio_details').$type<ContractStudioDetails>().notNull(),
    status: contractStatusEnum('status').notNull().default('awaiting_signatures'),
    pdfPath: text('pdf_path'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'contracts_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'contracts_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.proposalId, table.clientId],
      foreignColumns: [proposals.id, proposals.clientId],
      name: 'contracts_proposal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.optionId, table.proposalId],
      foreignColumns: [proposalOptions.id, proposalOptions.proposalId],
      name: 'contracts_option_proposal_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.legalEntityId, table.organizationId],
      foreignColumns: [legalEntities.id, legalEntities.organizationId],
      name: 'contracts_legal_entity_organization_fk',
    }).onDelete('restrict'),
    unique('contracts_id_client_id_key').on(table.id, table.clientId),
    uniqueIndex('contracts_open_per_proposal_key')
      .on(table.proposalId)
      .where(sql`${table.status} <> 'void'`),
    index('contracts_deal_idx').on(table.dealId, table.status),
    check('contracts_body_hash_shape', sql`${table.bodyHash} ~ '^[0-9a-f]{64}$'`),
  ],
).enableRLS();

export const contractSignatures = pgTable(
  'contract_signatures',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    party: signaturePartyEnum('party').notNull(),
    signerUserId: uuid('signer_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    typedName: text('typed_name').notNull(),
    signerRole: text('signer_role').notNull(),
    signerEmail: text('signer_email').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    bodyHash: text('body_hash').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.contractId, table.clientId],
      foreignColumns: [contracts.id, contracts.clientId],
      name: 'contract_signatures_contract_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'contract_signatures_client_organization_fk',
    }).onDelete('restrict'),
    unique('contract_signatures_party_key').on(table.contractId, table.party),
  ],
).enableRLS();
