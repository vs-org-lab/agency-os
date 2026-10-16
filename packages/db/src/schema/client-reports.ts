import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { clientReportKindEnum, clientReportStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects } from './rooms';

/**
 * A client's monthly report or quarterly QBR (RF-130). The team writes the texts; sharing freezes
 * the generated data and publishes the PDF as a room document. The foreign key to that document is
 * declared in the migration, because it clears only `document_id` when the document is removed.
 */
export const clientReports = pgTable(
  'client_reports',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    kind: clientReportKindEnum('kind').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: clientReportStatusEnum('status').notNull().default('draft'),
    summary: text('summary').notNull().default(''),
    highlights: text('highlights').notNull().default(''),
    nextSteps: text('next_steps').notNull().default(''),
    priorities: text('priorities').notNull().default(''),
    data: jsonb('data'),
    documentId: uuid('document_id'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_reports_client_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'client_reports_project_client_fk',
    }).onDelete('cascade'),
    unique('client_reports_client_period_key').on(table.clientId, table.kind, table.periodStart),
    index('client_reports_project_idx').on(table.projectId),
    check(
      'client_reports_period',
      sql`extract(day from ${table.periodStart}) = 1 and ${table.periodEnd} = case ${table.kind}
        when 'monthly' then (${table.periodStart} + interval '1 month' - interval '1 day')::date
        else (${table.periodStart} + interval '3 months' - interval '1 day')::date end
        and (${table.kind} = 'monthly' or extract(month from ${table.periodStart}) in (1, 4, 7, 10))`,
    ),
    check(
      'client_reports_texts_length',
      sql`char_length(${table.summary}) <= 2000 and char_length(${table.highlights}) <= 2000
        and char_length(${table.nextSteps}) <= 2000 and char_length(${table.priorities}) <= 2000`,
    ),
    check('client_reports_priorities_qbr', sql`${table.kind} = 'qbr' or ${table.priorities} = ''`),
    check(
      'client_reports_shared_complete',
      sql`${table.status} = 'draft' or (${table.sharedAt} is not null and ${table.data} is not null)`,
    ),
  ],
).enableRLS();
