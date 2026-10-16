import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { academyItemKindEnum, academyItemStatusEnum } from './enums';
import { libraryFiles } from './library';
import { organizations } from './organizations';
import { profiles } from './profiles';

/**
 * A client's academy (RF-140): tutorials and manuals point at a library file or an https link,
 * checklists hold their steps. A removed library file clears the link and keeps the item.
 */
export const academyItems = pgTable(
  'academy_items',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    kind: academyItemKindEnum('kind').notNull(),
    status: academyItemStatusEnum('status').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    position: integer('position').notNull(),
    libraryFileId: uuid('library_file_id').references(() => libraryFiles.id, {
      onDelete: 'set null',
    }),
    url: text('url'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'academy_items_client_organization_fk',
    }).onDelete('cascade'),
    unique('academy_items_id_client_key').on(table.id, table.clientId),
    index('academy_items_client_idx').on(table.clientId, table.position),
    check('academy_items_title_length', sql`char_length(${table.title}) between 1 and 120`),
    check('academy_items_description_length', sql`char_length(${table.description}) <= 1000`),
    check('academy_items_url_https', sql`${table.url} is null or ${table.url} like 'https://%'`),
    check(
      'academy_items_content',
      sql`case when ${table.kind} = 'checklist'
        then ${table.libraryFileId} is null and ${table.url} is null
        else not (${table.libraryFileId} is not null and ${table.url} is not null) end`,
    ),
    check(
      'academy_items_published_at',
      sql`${table.status} = 'draft' or ${table.publishedAt} is not null`,
    ),
  ],
).enableRLS();

export const academyChecklistSteps = pgTable(
  'academy_checklist_steps',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    itemId: uuid('item_id').notNull(),
    position: integer('position').notNull(),
    text: text('text').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.itemId, table.clientId],
      foreignColumns: [academyItems.id, academyItems.clientId],
      name: 'academy_checklist_steps_item_fk',
    }).onDelete('cascade'),
    unique('academy_checklist_steps_id_client_key').on(table.id, table.clientId),
    unique('academy_checklist_steps_item_position_key').on(table.itemId, table.position),
    check('academy_checklist_steps_text_length', sql`char_length(${table.text}) between 1 and 200`),
  ],
).enableRLS();

/** A step done, once, by the person who checked it. */
export const academyStepChecks = pgTable(
  'academy_step_checks',
  {
    stepId: uuid('step_id').primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    checkedBy: uuid('checked_by').references(() => profiles.id, { onDelete: 'set null' }),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.stepId, table.clientId],
      foreignColumns: [academyChecklistSteps.id, academyChecklistSteps.clientId],
      name: 'academy_step_checks_step_fk',
    }).onDelete('cascade'),
  ],
).enableRLS();

/** A training session held with the client's team (RF-141). */
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    heldOn: date('held_on').notNull(),
    title: text('title').notNull(),
    durationMinutes: integer('duration_minutes'),
    summary: text('summary').notNull().default(''),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'training_sessions_client_organization_fk',
    }).onDelete('cascade'),
    unique('training_sessions_id_client_key').on(table.id, table.clientId),
    index('training_sessions_client_idx').on(table.clientId, table.heldOn),
    check('training_sessions_title_length', sql`char_length(${table.title}) between 1 and 120`),
    check('training_sessions_summary_length', sql`char_length(${table.summary}) <= 2000`),
    check(
      'training_sessions_duration',
      sql`${table.durationMinutes} is null or ${table.durationMinutes} between 1 and 600`,
    ),
  ],
).enableRLS();

export const trainingSessionParticipants = pgTable(
  'training_session_participants',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    clientId: uuid('client_id').notNull(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    guestName: text('guest_name'),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.clientId],
      foreignColumns: [trainingSessions.id, trainingSessions.clientId],
      name: 'training_session_participants_session_fk',
    }).onDelete('cascade'),
    unique('training_session_participants_user_key').on(table.sessionId, table.userId),
    check(
      'training_session_participants_who',
      sql`(${table.userId} is null) <> (${table.guestName} is null)`,
    ),
    check(
      'training_session_participants_guest_length',
      sql`${table.guestName} is null or char_length(${table.guestName}) between 1 and 80`,
    ),
  ],
).enableRLS();

export const trainingSessionMaterials = pgTable(
  'training_session_materials',
  {
    organizationId: uuid('organization_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    clientId: uuid('client_id').notNull(),
    itemId: uuid('item_id').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.sessionId, table.itemId],
      name: 'training_session_materials_pkey',
    }),
    foreignKey({
      columns: [table.sessionId, table.clientId],
      foreignColumns: [trainingSessions.id, trainingSessions.clientId],
      name: 'training_session_materials_session_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.itemId, table.clientId],
      foreignColumns: [academyItems.id, academyItems.clientId],
      name: 'training_session_materials_item_fk',
    }).onDelete('cascade'),
  ],
).enableRLS();
