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
import { id, timestamps } from './columns';
import {
  brandHubBlockTypeEnum,
  brandHubPageKindEnum,
  brandHubStandardKeyEnum,
  libraryFileStatusEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const DEFAULT_BRAND_HUB_DESIGN = {
  colors: {
    surface: '#FFFFFF',
    panel: '#F5F5F4',
    text: '#1C1917',
    textMuted: '#57534E',
    accent: '#1C1917',
    divider: '#E7E5E4',
  },
  corners: 'soft',
  logoTiles: true,
  layout: 'sidebar',
} as const;

export const brandHubs = pgTable(
  'brand_hubs',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    design: jsonb('design').notNull().default(DEFAULT_BRAND_HUB_DESIGN),
    draftRevision: integer('draft_revision').notNull().default(1),
    draftUpdatedAt: timestamp('draft_updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** The publication the client sees; maintained by the publishing service. */
    publishedPublicationId: uuid('published_publication_id'),
    /** The publication the client's decision maker approved last. */
    approvedPublicationId: uuid('approved_publication_id'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'brand_hubs_client_organization_fk',
    }).onDelete('cascade'),
    unique('brand_hubs_client_key').on(table.clientId),
    unique('brand_hubs_id_client_key').on(table.id, table.clientId),
    check('brand_hubs_draft_revision_positive', sql`${table.draftRevision} > 0`),
  ],
).enableRLS();

export const brandHubPages = pgTable(
  'brand_hub_pages',
  {
    id: id(),
    hubId: uuid('hub_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    kind: brandHubPageKindEnum('kind').notNull(),
    standardKey: brandHubStandardKeyEnum('standard_key'),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.hubId, table.clientId],
      foreignColumns: [brandHubs.id, brandHubs.clientId],
      name: 'brand_hub_pages_hub_fk',
    }).onDelete('cascade'),
    unique('brand_hub_pages_hub_standard_key').on(table.hubId, table.standardKey),
    unique('brand_hub_pages_id_hub_key').on(table.id, table.hubId),
    index('brand_hub_pages_hub_idx').on(table.hubId),
    check('brand_hub_pages_title_length', sql`char_length(${table.title}) between 1 and 80`),
    check(
      'brand_hub_pages_standard_key',
      sql`(${table.kind} = 'standard') = (${table.standardKey} is not null)`,
    ),
  ],
).enableRLS();

export const brandHubBlocks = pgTable(
  'brand_hub_blocks',
  {
    id: id(),
    pageId: uuid('page_id').notNull(),
    hubId: uuid('hub_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    type: brandHubBlockTypeEnum('type').notNull(),
    position: integer('position').notNull(),
    content: jsonb('content').notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.pageId, table.hubId],
      foreignColumns: [brandHubPages.id, brandHubPages.hubId],
      name: 'brand_hub_blocks_page_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.hubId, table.clientId],
      foreignColumns: [brandHubs.id, brandHubs.clientId],
      name: 'brand_hub_blocks_hub_fk',
    }).onDelete('cascade'),
    index('brand_hub_blocks_page_idx').on(table.pageId),
  ],
).enableRLS();

export const brandHubAssets = pgTable(
  'brand_hub_assets',
  {
    id: id(),
    hubId: uuid('hub_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storagePath: text('storage_path').notNull(),
    uploadStatus: libraryFileStatusEnum('upload_status').notNull().default('uploading'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.hubId, table.clientId],
      foreignColumns: [brandHubs.id, brandHubs.clientId],
      name: 'brand_hub_assets_hub_fk',
    }).onDelete('cascade'),
    index('brand_hub_assets_hub_idx').on(table.hubId),
    check('brand_hub_assets_name_length', sql`char_length(${table.name}) between 1 and 200`),
    check(
      'brand_hub_assets_name_safe',
      sql`${table.name} !~ '[/\\\\[:cntrl:]]' and ${table.name} not in ('.', '..')`,
    ),
    check('brand_hub_assets_size_positive', sql`${table.sizeBytes} > 0`),
    check(
      'brand_hub_assets_ready_has_type',
      sql`${table.uploadStatus} <> 'ready' or ${table.mimeType} is not null`,
    ),
  ],
).enableRLS();

export const brandHubPublications = pgTable(
  'brand_hub_publications',
  {
    id: id(),
    hubId: uuid('hub_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    number: integer('number').notNull(),
    revision: integer('revision').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    publishedBy: uuid('published_by').references(() => profiles.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.hubId, table.clientId],
      foreignColumns: [brandHubs.id, brandHubs.clientId],
      name: 'brand_hub_publications_hub_fk',
    }).onDelete('cascade'),
    unique('brand_hub_publications_hub_number_key').on(table.hubId, table.number),
    check('brand_hub_publications_number_positive', sql`${table.number} > 0`),
  ],
).enableRLS();
