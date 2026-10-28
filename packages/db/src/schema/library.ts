import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { libraryFileKindEnum, libraryFileStatusEnum, updateVisibilityEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects, projectUpdates } from './rooms';

export const libraryFolders = pgTable(
  'library_folders',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    parentId: uuid('parent_id'),
    rootId: uuid('root_id').notNull(),
    depth: smallint('depth').notNull().default(0),
    name: text('name').notNull(),
    visibility: updateVisibilityEnum('visibility'),
    /** The root where the client's onboarding files land; the decision maker writes only here. */
    clientUploads: boolean('client_uploads').notNull().default(false),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'library_folders_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'library_folders_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.parentId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: 'library_folders_parent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.rootId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: 'library_folders_root_fk',
    }).onDelete('cascade'),
    unique('library_folders_id_project_key').on(table.id, table.projectId),
    uniqueIndex('library_folders_sibling_name_key').on(
      table.projectId,
      sql`coalesce(${table.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${table.name})`,
    ),
    index('library_folders_root_idx').on(table.rootId),
    check(
      'library_folders_root_visibility',
      sql`(${table.parentId} is null) = (${table.visibility} is not null)`,
    ),
    check('library_folders_root_depth', sql`(${table.parentId} is null) = (${table.depth} = 0)`),
    check('library_folders_depth_range', sql`${table.depth} between 0 and 3`),
    check('library_folders_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check(
      'library_folders_name_safe',
      sql`${table.name} !~ '[/\\\\[:cntrl:]]' and ${table.name} not in ('.', '..')`,
    ),
  ],
).enableRLS();

export const libraryFiles = pgTable(
  'library_files',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    folderId: uuid('folder_id').notNull(),
    rootId: uuid('root_id').notNull(),
    name: text('name').notNull(),
    storagePath: text('storage_path').notNull(),
    kind: libraryFileKindEnum('kind'),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    status: libraryFileStatusEnum('status').notNull().default('uploading'),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'library_files_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'library_files_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.folderId, table.projectId],
      foreignColumns: [libraryFolders.id, libraryFolders.projectId],
      name: 'library_files_folder_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.rootId, table.projectId],
      foreignColumns: [libraryFolders.id, libraryFolders.projectId],
      name: 'library_files_root_fk',
    }).onDelete('cascade'),
    unique('library_files_id_project_key').on(table.id, table.projectId),
    index('library_files_folder_idx').on(table.folderId),
    index('library_files_project_status_idx').on(table.projectId, table.status),
    check('library_files_name_length', sql`char_length(${table.name}) between 1 and 200`),
    check(
      'library_files_name_safe',
      sql`${table.name} !~ '[/\\\\[:cntrl:]]' and ${table.name} not in ('.', '..')`,
    ),
    check(
      'library_files_ready_has_type',
      sql`${table.status} <> 'ready' or (${table.kind} is not null and ${table.mimeType} is not null and ${table.sizeBytes} is not null)`,
    ),
  ],
).enableRLS();

export const projectUpdateFiles = pgTable(
  'project_update_files',
  {
    updateId: uuid('update_id')
      .notNull()
      .references(() => projectUpdates.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.updateId, table.fileId], name: 'project_update_files_pkey' }),
    foreignKey({
      columns: [table.fileId, table.projectId],
      foreignColumns: [libraryFiles.id, libraryFiles.projectId],
      name: 'project_update_files_file_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_update_files_project_client_fk',
    }).onDelete('cascade'),
    index('project_update_files_file_idx').on(table.fileId),
  ],
).enableRLS();
