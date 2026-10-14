import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { paymentRequests } from './billing';
import { clients } from './clients';
import { id, timestamps } from './columns';
import {
  currencyEnum,
  expenseCategoryEnum,
  subscriptionCycleEnum,
  subscriptionStatusEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

/** Recurring costs of the agency (RF-151); each renewal is recorded as an expense. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    vendor: text('vendor').notNull().default(''),
    category: expenseCategoryEnum('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    cycle: subscriptionCycleEnum('cycle').notNull(),
    nextRenewalOn: date('next_renewal_on').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('subscriptions_organization_renewal_idx').on(table.organizationId, table.nextRenewalOn),
    check('subscriptions_name_length', sql`char_length(${table.name}) between 1 and 80`),
    check('subscriptions_vendor_length', sql`char_length(${table.vendor}) <= 120`),
    check('subscriptions_amount_positive', sql`${table.amount} > 0`),
  ],
).enableRLS();

/**
 * What the agency spent (RF-151), with its receipt; an expense made for a client may be linked to
 * the payment request that charges it, so the client sees the original receipt (RF-153).
 */
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    spentOn: date('spent_on').notNull(),
    vendor: text('vendor').notNull(),
    description: text('description').notNull().default(''),
    category: expenseCategoryEnum('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    receiptPath: text('receipt_path'),
    receiptName: text('receipt_name'),
    receiptMimeType: text('receipt_mime_type'),
    clientId: uuid('client_id'),
    paymentRequestId: uuid('payment_request_id'),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'expenses_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.paymentRequestId, table.clientId],
      foreignColumns: [paymentRequests.id, paymentRequests.clientId],
      name: 'expenses_payment_request_client_fk',
    }).onDelete('restrict'),
    index('expenses_organization_spent_idx').on(table.organizationId, table.spentOn),
    index('expenses_payment_request_idx').on(table.paymentRequestId),
    check('expenses_vendor_length', sql`char_length(${table.vendor}) between 1 and 120`),
    check('expenses_description_length', sql`char_length(${table.description}) <= 500`),
    check('expenses_amount_positive', sql`${table.amount} > 0`),
    check(
      'expenses_request_needs_client',
      sql`${table.paymentRequestId} is null or ${table.clientId} is not null`,
    ),
    check(
      'expenses_receipt_complete',
      sql`(${table.receiptPath} is null) = (${table.receiptName} is null)
          and (${table.receiptPath} is null) = (${table.receiptMimeType} is null)`,
    ),
  ],
).enableRLS();
