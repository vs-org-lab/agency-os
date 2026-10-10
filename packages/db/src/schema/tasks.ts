import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { taskSourceEnum, taskStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects, projectSteps } from './rooms';

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id'),
    projectId: uuid('project_id'),
    stepId: uuid('step_id').references(() => projectSteps.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
    dueOn: date('due_on'),
    status: taskStatusEnum('status').notNull().default('open'),
    source: taskSourceEnum('source').notNull().default('manual'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'tasks_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'tasks_project_client_fk',
    }).onDelete('cascade'),
    uniqueIndex('tasks_project_source_key')
      .on(table.projectId, table.source)
      .where(sql`${table.source} <> 'manual'`),
    index('tasks_assignee_idx').on(table.assigneeId, table.status),
    index('tasks_client_idx').on(table.clientId, table.status),
    check('tasks_title_length', sql`char_length(${table.title}) between 1 and 200`),
    check(
      'tasks_project_needs_client',
      sql`${table.projectId} is null or ${table.clientId} is not null`,
    ),
  ],
).enableRLS();

export const taskItems = pgTable(
  'task_items',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    done: boolean('done').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique('task_items_position_key').on(table.taskId, table.position),
    check('task_items_title_length', sql`char_length(${table.title}) between 1 and 200`),
  ],
).enableRLS();
