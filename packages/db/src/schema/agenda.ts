import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { agendaEventKindEnum, agendaEventStatusEnum, callSyncStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects } from './rooms';

export const agendaEvents = pgTable(
  'agenda_events',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id'),
    projectId: uuid('project_id'),
    kind: agendaEventKindEnum('kind').notNull(),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    location: text('location').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    inviteClient: boolean('invite_client').notNull().default(false),
    status: agendaEventStatusEnum('status').notNull().default('scheduled'),
    syncStatus: callSyncStatusEnum('sync_status').notNull().default('pending'),
    /** Raised by every change, so a sync only marks the revision it sent as synced. */
    syncRevision: integer('sync_revision').notNull().default(1),
    externalEventId: text('external_event_id'),
    meetUrl: text('meet_url'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'agenda_events_client_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'agenda_events_project_client_fk',
    }).onDelete('cascade'),
    index('agenda_events_organization_starts_idx').on(table.organizationId, table.startsAt),
    check(
      'agenda_events_client_by_kind',
      sql`(${table.kind} = 'internal') = (${table.clientId} is null)`,
    ),
    check(
      'agenda_events_kickoff_project',
      sql`${table.kind} <> 'kickoff' or ${table.projectId} is not null`,
    ),
    check(
      'agenda_events_duration',
      sql`${table.endsAt} > ${table.startsAt} and ${table.endsAt} <= ${table.startsAt} + interval '12 hours'`,
    ),
    check('agenda_events_title_length', sql`char_length(${table.title}) between 1 and 120`),
    check('agenda_events_notes_length', sql`char_length(${table.notes}) <= 2000`),
    check('agenda_events_location_length', sql`char_length(${table.location}) <= 500`),
  ],
).enableRLS();
