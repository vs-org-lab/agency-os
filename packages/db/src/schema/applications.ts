import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { contacts } from './contacts';
import { deals } from './deals';
import { applicationPathEnum, throttleKindEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const applicationForms = pgTable(
  'application_forms',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    unique('application_forms_organization_version_key').on(table.organizationId, table.version),
    uniqueIndex('application_forms_active_key')
      .on(table.organizationId)
      .where(sql`${table.isActive}`),
  ],
).enableRLS();

export const applications = pgTable(
  'applications',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'restrict' }),
    dealId: uuid('deal_id').notNull(),
    formId: uuid('form_id')
      .notNull()
      .references(() => applicationForms.id, { onDelete: 'restrict' }),
    answers: jsonb('answers').notNull(),
    score: integer('score').notNull(),
    path: applicationPathEnum('path').notNull(),
    knockouts: text('knockouts')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: jsonb('source').notNull().default({}),
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    reviewDecision: applicationPathEnum('review_decision'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, { onDelete: 'restrict' }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'applications_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'applications_deal_client_fk',
    }).onDelete('restrict'),
    index('applications_organization_created_idx').on(table.organizationId, table.createdAt),
    index('applications_deal_id_idx').on(table.dealId),
  ],
).enableRLS();

export const submissionThrottle = pgTable(
  'submission_throttle',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    kind: throttleKindEnum('kind').notNull(),
    keyHash: text('key_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    unique('submission_throttle_window_key').on(
      table.organizationId,
      table.kind,
      table.keyHash,
      table.windowStart,
    ),
  ],
).enableRLS();
