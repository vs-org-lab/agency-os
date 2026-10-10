import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { currencyEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects } from './rooms';

export const projectStaffAssignments = pgTable(
  'project_staff_assignments',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'project_staff_assignments_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_staff_assignments_project_client_fk',
    }).onDelete('cascade'),
    unique('project_staff_assignments_project_user_key').on(table.projectId, table.userId),
    index('project_staff_assignments_user_idx').on(table.userId),
  ],
).enableRLS();

export const teamMemberRates = pgTable(
  'team_member_rates',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    hourlyCost: numeric('hourly_cost', { precision: 10, scale: 2 }),
    currency: currencyEnum('currency').notNull().default('EUR'),
    weeklyHours: integer('weekly_hours'),
    ...timestamps,
  },
  (table) => [
    unique('team_member_rates_organization_user_key').on(table.organizationId, table.userId),
    check(
      'team_member_rates_hourly_cost_positive',
      sql`${table.hourlyCost} is null or ${table.hourlyCost} >= 0`,
    ),
    check(
      'team_member_rates_weekly_hours_range',
      sql`${table.weeklyHours} is null or ${table.weeklyHours} between 0 and 80`,
    ),
  ],
).enableRLS();
