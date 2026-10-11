import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { libraryFileStatusEnum, projectDocumentKindEnum, projectDocumentStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects } from './rooms';

export const projectDocuments = pgTable(
  'project_documents',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    kind: projectDocumentKindEnum('kind').notNull(),
    status: projectDocumentStatusEnum('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    /** The version the client approved last; it stays visible while a newer version is drafted. */
    approvedVersionId: uuid('approved_version_id'),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'project_documents_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_documents_project_client_fk',
    }).onDelete('cascade'),
    unique('project_documents_id_project_key').on(table.id, table.projectId),
    index('project_documents_project_idx').on(table.projectId),
    check('project_documents_title_length', sql`char_length(${table.title}) between 1 and 200`),
  ],
).enableRLS();

export const projectDocumentVersions = pgTable(
  'project_document_versions',
  {
    id: id(),
    documentId: uuid('document_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    number: integer('number').notNull(),
    kind: projectDocumentKindEnum('kind').notNull(),
    url: text('url'),
    storagePath: text('storage_path'),
    fileName: text('file_name'),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    pages: integer('pages'),
    uploadStatus: libraryFileStatusEnum('upload_status').notNull().default('ready'),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.documentId, table.projectId],
      foreignColumns: [projectDocuments.id, projectDocuments.projectId],
      name: 'project_document_versions_document_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_document_versions_project_client_fk',
    }).onDelete('cascade'),
    unique('project_document_versions_document_number_key').on(table.documentId, table.number),
    check('project_document_versions_number_positive', sql`${table.number} > 0`),
    check(
      'project_document_versions_content',
      sql`(${table.kind} in ('figma', 'link') and ${table.url} is not null and ${table.storagePath} is null)
        or (${table.kind} in ('pdf', 'file') and ${table.storagePath} is not null and ${table.url} is null)`,
    ),
  ],
).enableRLS();

export const projectDocumentComments = pgTable(
  'project_document_comments',
  {
    id: id(),
    documentId: uuid('document_id').notNull(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => projectDocumentVersions.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    internal: boolean('internal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.documentId, table.projectId],
      foreignColumns: [projectDocuments.id, projectDocuments.projectId],
      name: 'project_document_comments_document_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_document_comments_project_client_fk',
    }).onDelete('cascade'),
    index('project_document_comments_document_idx').on(table.documentId),
    check(
      'project_document_comments_body_length',
      sql`char_length(${table.body}) between 1 and 2000`,
    ),
  ],
).enableRLS();
