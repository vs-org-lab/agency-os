import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id } from './columns';
import { clientMilestoneKindEnum } from './enums';
import { tasks } from './tasks';

/** A client milestone already handled, such as a year of partnership (RF-161, AUT-29). */
export const clientMilestones = pgTable(
  'client_milestones',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    kind: clientMilestoneKindEnum('kind').notNull(),
    year: integer('year').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_milestones_client_organization_fk',
    }).onDelete('cascade'),
    unique('client_milestones_client_kind_year_key').on(table.clientId, table.kind, table.year),
    check('client_milestones_year_positive', sql`${table.year} >= 1`),
  ],
).enableRLS();
