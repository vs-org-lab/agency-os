import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import {
  currencyEnum,
  retainerExtraStatusEnum,
  retainerLimitKindEnum,
  retainerStatusEnum,
} from './enums';
import { profiles } from './profiles';
import { approvals, projects } from './rooms';
import { tasks } from './tasks';

/** A project's retainer (RF-110): its tier, monthly fee and annual review. */
export const retainers = pgTable(
  'retainers',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    tier: text('tier').notNull(),
    monthlyFee: numeric('monthly_fee', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    startsOn: date('starts_on').notNull(),
    reviewOn: date('review_on').notNull(),
    status: retainerStatusEnum('status').notNull().default('active'),
    /** The review date whose reminder task was already created (AUT-24). */
    reviewAlertedFor: date('review_alerted_for'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'retainers_client_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'retainers_project_client_fk',
    }).onDelete('cascade'),
    unique('retainers_project_key').on(table.projectId),
    unique('retainers_id_client_key').on(table.id, table.clientId),
    check('retainers_tier_length', sql`char_length(${table.tier}) between 1 and 40`),
    check('retainers_fee_not_negative', sql`${table.monthlyFee} >= 0`),
    check('retainers_starts_first_day', sql`extract(day from ${table.startsOn}) = 1`),
  ],
).enableRLS();

/** The monthly limit of one kind of work (RF-110). */
export const retainerLimits = pgTable(
  'retainer_limits',
  {
    retainerId: uuid('retainer_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    kind: retainerLimitKindEnum('kind').notNull(),
    monthlyLimit: numeric('monthly_limit', { precision: 6, scale: 1 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.retainerId, table.kind] }),
    foreignKey({
      columns: [table.retainerId, table.clientId],
      foreignColumns: [retainers.id, retainers.clientId],
      name: 'retainer_limits_retainer_client_fk',
    }).onDelete('cascade'),
    check('retainer_limits_positive', sql`${table.monthlyLimit} > 0`),
  ],
).enableRLS();

/** A pedido extra (RF-112): work above the limit, quoted and approved by the client first. */
export const retainerExtraRequests = pgTable(
  'retainer_extra_requests',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    retainerId: uuid('retainer_id').notNull(),
    kind: retainerLimitKindEnum('kind').notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 6, scale: 1 }).notNull(),
    quoteAmount: numeric('quote_amount', { precision: 12, scale: 2 }),
    currency: currencyEnum('currency'),
    status: retainerExtraStatusEnum('status').notNull().default('requested'),
    requestedBy: uuid('requested_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvalId: uuid('approval_id').references(() => approvals.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.retainerId, table.clientId],
      foreignColumns: [retainers.id, retainers.clientId],
      name: 'retainer_extra_requests_retainer_client_fk',
    }).onDelete('cascade'),
    unique('retainer_extra_requests_id_client_key').on(table.id, table.clientId),
    index('retainer_extra_requests_retainer_idx').on(table.retainerId, table.createdAt),
    check(
      'retainer_extra_requests_description_length',
      sql`char_length(${table.description}) between 1 and 500`,
    ),
    check('retainer_extra_requests_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'retainer_extra_requests_quote',
      sql`(${table.quoteAmount} is null) = (${table.currency} is null)
          and (${table.quoteAmount} is null or ${table.quoteAmount} > 0)
          and (${table.status} = 'requested' or ${table.quoteAmount} is not null)`,
    ),
  ],
).enableRLS();

/** Work counted against a month (RF-111); work paid by an extra request stays outside the limit. */
export const retainerUsage = pgTable(
  'retainer_usage',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    retainerId: uuid('retainer_id').notNull(),
    kind: retainerLimitKindEnum('kind').notNull(),
    month: date('month').notNull(),
    quantity: numeric('quantity', { precision: 6, scale: 1 }).notNull(),
    description: text('description').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    extraRequestId: uuid('extra_request_id').references(() => retainerExtraRequests.id, {
      onDelete: 'set null',
    }),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.retainerId, table.clientId],
      foreignColumns: [retainers.id, retainers.clientId],
      name: 'retainer_usage_retainer_client_fk',
    }).onDelete('cascade'),
    index('retainer_usage_retainer_month_idx').on(table.retainerId, table.month),
    check('retainer_usage_month_first_day', sql`extract(day from ${table.month}) = 1`),
    check('retainer_usage_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'retainer_usage_description_length',
      sql`char_length(${table.description}) between 1 and 500`,
    ),
  ],
).enableRLS();

/** Consumption alerts already sent (AUT-22), one per kind, month and threshold. */
export const retainerAlerts = pgTable(
  'retainer_alerts',
  {
    retainerId: uuid('retainer_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    kind: retainerLimitKindEnum('kind').notNull(),
    month: date('month').notNull(),
    threshold: integer('threshold').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.retainerId, table.kind, table.month, table.threshold] }),
    foreignKey({
      columns: [table.retainerId, table.clientId],
      foreignColumns: [retainers.id, retainers.clientId],
      name: 'retainer_alerts_retainer_client_fk',
    }).onDelete('cascade'),
    check('retainer_alerts_threshold', sql`${table.threshold} in (80, 100)`),
  ],
).enableRLS();

/**
 * A client's request for work within the allowance (US-19). It outlives the team task it created
 * so the client can follow its state without ever reading the task.
 */
export const retainerRequests = pgTable(
  'retainer_requests',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    retainerId: uuid('retainer_id').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.retainerId, table.clientId],
      foreignColumns: [retainers.id, retainers.clientId],
      name: 'retainer_requests_retainer_client_fk',
    }).onDelete('cascade'),
    index('retainer_requests_client_idx').on(table.clientId, table.createdAt),
    check(
      'retainer_requests_description_length',
      sql`char_length(${table.description}) between 1 and 2000`,
    ),
  ],
).enableRLS();
