import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { contracts } from './contracts';
import { deals } from './deals';
import {
  billingMilestoneStatusEnum,
  currencyEnum,
  invoiceIssuerEnum,
  localeEnum,
  milestoneTriggerEnum,
  paymentMethodEnum,
  paymentRequestStatusEnum,
  paymentStatusEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projectPhases } from './rooms';

/** The issuing entity as it stood when the payment request was sent. */
export type PaymentRequestIssuerDetails = {
  legalName: string;
  taxId: string;
  address: string;
  country: 'PT' | 'AO';
  email: string;
  bankName: string;
  iban: string;
  bic: string;
  paymentInstructions: string;
};

/** The billed client as accepted on the proposal. */
export type PaymentRequestClientDetails = {
  legalName: string;
  taxId: string;
  address: string;
};

export const billingCounters = pgTable(
  'billing_counters',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    year: integer('year').notNull(),
    lastNumber: integer('last_number').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.year] }),
    check('billing_counters_last_number_positive', sql`${table.lastNumber} > 0`),
  ],
).enableRLS();

export const billingMilestones = pgTable(
  'billing_milestones',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    position: integer('position').notNull(),
    label: text('label').notNull(),
    percent: integer('percent').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    status: billingMilestoneStatusEnum('status').notNull().default('pending'),
    trigger: milestoneTriggerEnum('trigger').notNull(),
    phaseId: uuid('phase_id'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'billing_milestones_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'billing_milestones_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.contractId, table.clientId],
      foreignColumns: [contracts.id, contracts.clientId],
      name: 'billing_milestones_contract_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.phaseId, table.clientId],
      foreignColumns: [projectPhases.id, projectPhases.clientId],
      name: 'billing_milestones_phase_client_fk',
    }).onDelete('restrict'),
    unique('billing_milestones_position_key').on(table.contractId, table.position),
    unique('billing_milestones_id_client_id_key').on(table.id, table.clientId),
    index('billing_milestones_deal_idx').on(table.dealId, table.position),
    check('billing_milestones_amount_positive', sql`${table.amount} > 0`),
    check('billing_milestones_percent_range', sql`${table.percent} between 1 and 100`),
    check(
      'billing_milestones_phase_only_on_phase_approval',
      sql`${table.phaseId} is null or ${table.trigger} = 'phase_approval'`,
    ),
  ],
).enableRLS();

export const paymentRequests = pgTable(
  'payment_requests',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    milestoneId: uuid('milestone_id').notNull(),
    number: text('number').notNull(),
    label: text('label').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    locale: localeEnum('locale').notNull(),
    dueDate: date('due_date').notNull(),
    status: paymentRequestStatusEnum('status').notNull().default('sent'),
    issuerDetails: jsonb('issuer_details').$type<PaymentRequestIssuerDetails>().notNull(),
    clientDetails: jsonb('client_details').$type<PaymentRequestClientDetails>().notNull(),
    pdfPath: text('pdf_path'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    lastReminderStage: integer('last_reminder_stage').notNull().default(0),
    lastChasedAt: timestamp('last_chased_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'payment_requests_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'payment_requests_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.milestoneId, table.clientId],
      foreignColumns: [billingMilestones.id, billingMilestones.clientId],
      name: 'payment_requests_milestone_client_fk',
    }).onDelete('restrict'),
    unique('payment_requests_number_key').on(table.organizationId, table.number),
    unique('payment_requests_id_client_id_key').on(table.id, table.clientId),
    uniqueIndex('payment_requests_open_per_milestone_key')
      .on(table.milestoneId)
      .where(sql`${table.status} <> 'void'`),
    index('payment_requests_deal_idx').on(table.dealId, table.sentAt),
    index('payment_requests_open_due_idx')
      .on(table.dueDate)
      .where(sql`${table.status} = 'sent'`),
    check('payment_requests_amount_positive', sql`${table.amount} > 0`),
    check('payment_requests_reminder_stage_range', sql`${table.lastReminderStage} between 0 and 5`),
  ],
).enableRLS();

export const payments = pgTable(
  'payments',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    requestId: uuid('request_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    method: paymentMethodEnum('method').notNull(),
    reference: text('reference').notNull().default(''),
    receivedOn: date('received_on').notNull(),
    status: paymentStatusEnum('status').notNull(),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'restrict' }),
    providerEventId: text('provider_event_id'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.requestId, table.clientId],
      foreignColumns: [paymentRequests.id, paymentRequests.clientId],
      name: 'payments_request_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'payments_client_organization_fk',
    }).onDelete('restrict'),
    uniqueIndex('payments_provider_event_key').on(table.providerEventId),
    index('payments_request_idx').on(table.requestId),
    check('payments_amount_positive', sql`${table.amount} > 0`),
    check('payments_currency_shape', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
).enableRLS();

export const legalInvoices = pgTable(
  'legal_invoices',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    requestId: uuid('request_id').notNull(),
    issuer: invoiceIssuerEnum('issuer').notNull(),
    number: text('number').notNull(),
    issuedOn: date('issued_on').notNull(),
    pdfPath: text('pdf_path').notNull(),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.requestId, table.clientId],
      foreignColumns: [paymentRequests.id, paymentRequests.clientId],
      name: 'legal_invoices_request_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'legal_invoices_client_organization_fk',
    }).onDelete('restrict'),
    unique('legal_invoices_request_key').on(table.requestId),
  ],
).enableRLS();
