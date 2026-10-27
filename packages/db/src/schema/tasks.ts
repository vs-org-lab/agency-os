import { sql } from 'drizzle-orm';
import {
  boolean,
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { taskSourceEnum, taskStatusEnum } from './enums';
import { libraryFiles } from './library';
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

export const taskComments = pgTable(
  'task_comments',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('task_comments_task_idx').on(table.taskId, table.createdAt),
    check('task_comments_body_length', sql`char_length(${table.body}) between 1 and 5000`),
  ],
).enableRLS();

export const taskFiles = pgTable(
  'task_files',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    libraryFileId: uuid('library_file_id')
      .notNull()
      .references(() => libraryFiles.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.libraryFileId], name: 'task_files_pkey' }),
    index('task_files_file_idx').on(table.libraryFileId),
  ],
).enableRLS();

export const taskLinks = pgTable(
  'task_links',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('task_links_task_idx').on(table.taskId),
    check(
      'task_links_url_https',
      sql`char_length(${table.url}) <= 2000 and ${table.url} like 'https://%'`,
    ),
    check(
      'task_links_title_length',
      sql`${table.title} is null or char_length(${table.title}) <= 200`,
    ),
  ],
).enableRLS();
