import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { proofKindEnum, proofVersionStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projectPhases, projects } from './rooms';

export const proofFiles = pgTable(
  'proof_files',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    phaseId: uuid('phase_id'),
    title: text('title').notNull(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'proof_files_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'proof_files_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.phaseId, table.clientId],
      foreignColumns: [projectPhases.id, projectPhases.clientId],
      name: 'proof_files_phase_client_fk',
    }).onDelete('set null'),
    unique('proof_files_id_project_key').on(table.id, table.projectId),
    index('proof_files_project_idx').on(table.projectId),
    check('proof_files_title_length', sql`char_length(${table.title}) between 1 and 200`),
  ],
).enableRLS();

export const proofVersions = pgTable(
  'proof_versions',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    fileId: uuid('file_id').notNull(),
    number: integer('number').notNull(),
    storagePath: text('storage_path').notNull(),
    kind: proofKindEnum('kind'),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    pages: integer('pages'),
    status: proofVersionStatusEnum('status').notNull().default('uploading'),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.fileId, table.projectId],
      foreignColumns: [proofFiles.id, proofFiles.projectId],
      name: 'proof_versions_file_project_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'proof_versions_project_client_fk',
    }).onDelete('cascade'),
    unique('proof_versions_file_number_key').on(table.fileId, table.number),
    check('proof_versions_number_positive', sql`${table.number} > 0`),
    check(
      'proof_versions_ready_has_type',
      sql`${table.status} <> 'ready' or (${table.kind} is not null and ${table.mimeType} is not null)`,
    ),
  ],
).enableRLS();

export const proofComments = pgTable(
  'proof_comments',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => proofVersions.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    anchor: jsonb('anchor'),
    number: integer('number'),
    internal: boolean('internal').notNull().default(false),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'proof_comments_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'proof_comments_parent_fk',
    }).onDelete('cascade'),
    unique('proof_comments_version_number_key').on(table.versionId, table.number),
    index('proof_comments_version_idx').on(table.versionId),
    check('proof_comments_body_length', sql`char_length(${table.body}) between 1 and 2000`),
  ],
).enableRLS();
