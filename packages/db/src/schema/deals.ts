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
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { contacts } from './contacts';
import {
  callOutcomeEnum,
  callStatusEnum,
  callSyncStatusEnum,
  currencyEnum,
  dealSourceEnum,
  followUpStatusEnum,
  nextStepOwnerKindEnum,
  pipelineCodeEnum,
  timelineKindEnum,
} from './enums';
import { profiles } from './profiles';

export const deals = pgTable(
  'deals',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    title: text('title').notNull(),
    pipelineCode: pipelineCodeEnum('pipeline_code').notNull().default('0.1'),
    nextStep: text('next_step'),
    nextStepOwnerKind: nextStepOwnerKindEnum('next_step_owner_kind'),
    nextStepOwnerUserId: uuid('next_step_owner_user_id').references(() => profiles.id, {
      onDelete: 'restrict',
    }),
    nextStepDueOn: date('next_step_due_on'),
    estimatedValue: numeric('estimated_value', { precision: 12, scale: 2 }),
    currency: currencyEnum('currency').notNull().default('EUR'),
    source: dealSourceEnum('source').notNull(),
    lostReason: text('lost_reason'),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'deals_client_organization_fk',
    }).onDelete('restrict'),
    unique('deals_id_client_id_key').on(table.id, table.clientId),
    uniqueIndex('deals_open_per_client_key')
      .on(table.clientId)
      .where(sql`${table.pipelineCode} not in ('X.3', 'X.4') and ${table.archivedAt} is null`),
    index('deals_organization_code_idx').on(table.organizationId, table.pipelineCode),
  ],
).enableRLS();

export const dealStageChanges = pgTable(
  'deal_stage_changes',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    fromCode: pipelineCodeEnum('from_code'),
    toCode: pipelineCodeEnum('to_code').notNull(),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'deal_stage_changes_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'deal_stage_changes_client_organization_fk',
    }).onDelete('restrict'),
    index('deal_stage_changes_deal_created_idx').on(table.dealId, table.createdAt),
  ],
).enableRLS();

export const calls = pgTable(
  'calls',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'restrict' }),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    leadTimeZone: text('lead_time_zone'),
    status: callStatusEnum('status').notNull().default('scheduled'),
    syncStatus: callSyncStatusEnum('sync_status').notNull().default('pending'),
    externalEventId: text('external_event_id'),
    meetUrl: text('meet_url'),
    outcome: callOutcomeEnum('outcome'),
    outcomeReason: text('outcome_reason'),
    notes: text('notes'),
    manageTokenHash: text('manage_token_hash').unique(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'calls_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'calls_client_organization_fk',
    }).onDelete('restrict'),
    unique('calls_id_client_id_key').on(table.id, table.clientId),
    uniqueIndex('calls_scheduled_per_deal_key')
      .on(table.dealId)
      .where(sql`${table.status} = 'scheduled'`),
    index('calls_host_starts_idx').on(table.hostUserId, table.startsAt),
    check('calls_ends_after_start', sql`${table.endsAt} > ${table.startsAt}`),
  ],
).enableRLS();

export const followUps = pgTable(
  'follow_ups',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull(),
    callId: uuid('call_id').notNull(),
    dueOn: date('due_on').notNull(),
    sequenceDay: integer('sequence_day').notNull(),
    suggestedMessage: text('suggested_message').notNull(),
    status: followUpStatusEnum('status').notNull().default('open'),
    assignedTo: uuid('assigned_to').references(() => profiles.id, { onDelete: 'restrict' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'follow_ups_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.callId, table.clientId],
      foreignColumns: [calls.id, calls.clientId],
      name: 'follow_ups_call_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'follow_ups_client_organization_fk',
    }).onDelete('restrict'),
    unique('follow_ups_deal_call_day_key').on(table.dealId, table.callId, table.sequenceDay),
    check('follow_ups_sequence_day', sql`${table.sequenceDay} in (3, 7, 14, 30)`),
    index('follow_ups_status_due_idx').on(table.status, table.dueOn),
  ],
).enableRLS();

export const timelineEntries = pgTable(
  'timeline_entries',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id'),
    kind: timelineKindEnum('kind').notNull(),
    summary: jsonb('summary').notNull().default({}),
    itemType: text('item_type'),
    itemId: uuid('item_id'),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'timeline_entries_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'timeline_entries_deal_client_fk',
    }).onDelete('restrict'),
    index('timeline_entries_deal_created_idx').on(table.dealId, table.createdAt),
    index('timeline_entries_client_created_idx').on(table.clientId, table.createdAt),
  ],
).enableRLS();
