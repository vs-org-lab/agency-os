import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
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
import { deals } from './deals';
import {
  approvalStatusEnum,
  approvalSubjectEnum,
  phaseStatusEnum,
  pipelineCodeEnum,
  projectStatusEnum,
  stepStatusEnum,
  updateKindEnum,
  updateVisibilityEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const processTemplates = pgTable(
  'process_templates',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    publishedBy: uuid('published_by').references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('process_templates_version_key').on(table.organizationId, table.key, table.version),
    uniqueIndex('process_templates_active_key')
      .on(table.organizationId, table.key)
      .where(sql`${table.isActive}`),
    uniqueIndex('process_templates_default_key')
      .on(table.organizationId)
      .where(sql`${table.isActive} and ${table.isDefault}`),
    check('process_templates_key_shape', sql`${table.key} ~ '^[a-z0-9][a-z0-9-]{0,39}$'`),
  ],
).enableRLS();

export const projects = pgTable(
  'projects',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id'),
    name: text('name').notNull(),
    status: projectStatusEnum('status').notNull().default('active'),
    templateKey: text('template_key').notNull(),
    templateVersion: integer('template_version').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    revisionLimit: integer('revision_limit').notNull().default(3),
    /** The revision limit for which the 80% warning was last sent (AUT-17). */
    roundsWarnedLimit: integer('rounds_warned_limit'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'projects_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'projects_deal_client_fk',
    }).onDelete('restrict'),
    unique('projects_id_client_id_key').on(table.id, table.clientId),
    check('projects_revision_limit_range', sql`${table.revisionLimit} between 1 and 20`),
    uniqueIndex('projects_deal_key')
      .on(table.dealId)
      .where(sql`${table.dealId} is not null`),
    index('projects_client_idx').on(table.clientId, table.createdAt),
  ],
).enableRLS();

export const projectPhases = pgTable(
  'project_phases',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    codeOnStart: pipelineCodeEnum('code_on_start'),
    codeOnDone: pipelineCodeEnum('code_on_done'),
    status: phaseStatusEnum('status').notNull().default('pending'),
    dueOn: date('due_on'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_phases_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'project_phases_client_organization_fk',
    }).onDelete('restrict'),
    unique('project_phases_position_key').on(table.projectId, table.position),
    unique('project_phases_id_client_id_key').on(table.id, table.clientId),
  ],
).enableRLS();

export const projectSteps = pgTable(
  'project_steps',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    phaseId: uuid('phase_id').notNull(),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    status: stepStatusEnum('status').notNull().default('todo'),
    assigneeId: uuid('assignee_id').references(() => profiles.id, { onDelete: 'set null' }),
    dueOn: date('due_on'),
    visibleToClient: boolean('visible_to_client').notNull().default(false),
    chained: boolean('chained').notNull().default(false),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    reopenedAfterShared: boolean('reopened_after_shared').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.phaseId, table.clientId],
      foreignColumns: [projectPhases.id, projectPhases.clientId],
      name: 'project_steps_phase_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'project_steps_client_organization_fk',
    }).onDelete('restrict'),
    unique('project_steps_position_key').on(table.phaseId, table.position),
    index('project_steps_project_idx').on(table.projectId),
    index('project_steps_assignee_idx').on(table.assigneeId),
  ],
).enableRLS();

export const projectUpdates = pgTable(
  'project_updates',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    kind: updateKindEnum('kind').notNull().default('manual'),
    body: text('body').notNull(),
    milestone: text('milestone'),
    visibility: updateVisibilityEnum('visibility').notNull().default('internal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_updates_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'project_updates_client_organization_fk',
    }).onDelete('restrict'),
    index('project_updates_project_idx').on(table.projectId, table.createdAt),
    check('project_updates_body_length', sql`char_length(${table.body}) between 1 and 5000`),
  ],
).enableRLS();

export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    subjectType: approvalSubjectEnum('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    status: approvalStatusEnum('status').notNull().default('pending'),
    requestedBy: uuid('requested_by').references(() => profiles.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid('decided_by').references(() => profiles.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    comment: text('comment'),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    alertedAt: timestamp('alerted_at', { withTimezone: true }),
    extraRound: boolean('extra_round').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'approvals_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'approvals_client_organization_fk',
    }).onDelete('restrict'),
    uniqueIndex('approvals_pending_per_subject_key')
      .on(table.subjectType, table.subjectId)
      .where(sql`${table.status} = 'pending'`),
    index('approvals_project_idx').on(table.projectId, table.requestedAt),
  ],
).enableRLS();
