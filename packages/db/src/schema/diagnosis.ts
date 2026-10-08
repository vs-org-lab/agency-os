import { sql } from 'drizzle-orm';
import {
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { deals } from './deals';
import {
  coreLevelEnum,
  coreTemplateKindEnum,
  evidenceKindEnum,
  findingOwnerEnum,
  orbitFrontEnum,
  roadmapLaneEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const coreTemplates = pgTable(
  'core_templates',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    kind: coreTemplateKindEnum('kind').notNull(),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    publishedBy: uuid('published_by').references(() => profiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('core_templates_version_key').on(table.organizationId, table.kind, table.version),
    uniqueIndex('core_templates_active_key')
      .on(table.organizationId, table.kind)
      .where(sql`${table.isActive}`),
  ],
).enableRLS();

export const coreEngagements = pgTable(
  'core_engagements',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id').notNull().unique(),
    briefingTemplateId: uuid('briefing_template_id')
      .notNull()
      .references(() => coreTemplates.id, { onDelete: 'restrict' }),
    gridTemplateId: uuid('grid_template_id')
      .notNull()
      .references(() => coreTemplates.id, { onDelete: 'restrict' }),
    transcript: text('transcript'),
    buyerTestUrl: text('buyer_test_url'),
    narrative: text('narrative'),
    briefingSharedAt: timestamp('briefing_shared_at', { withTimezone: true }),
    crossReviewBy: uuid('cross_review_by').references(() => profiles.id, { onDelete: 'restrict' }),
    crossReviewAt: timestamp('cross_review_at', { withTimezone: true }),
    crossReviewNotes: text('cross_review_notes'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'core_engagements_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'core_engagements_client_organization_fk',
    }).onDelete('restrict'),
    unique('core_engagements_id_client_id_key').on(table.id, table.clientId),
  ],
).enableRLS();

export const coreBriefingNotes = pgTable(
  'core_briefing_notes',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    engagementId: uuid('engagement_id').notNull(),
    blockId: text('block_id').notNull(),
    questionId: text('question_id').notNull().default(''),
    body: text('body').notNull(),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.engagementId, table.clientId],
      foreignColumns: [coreEngagements.id, coreEngagements.clientId],
      name: 'core_briefing_notes_engagement_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'core_briefing_notes_client_organization_fk',
    }).onDelete('restrict'),
    unique('core_briefing_notes_slot_key').on(table.engagementId, table.blockId, table.questionId),
  ],
).enableRLS();

export const coreFindings = pgTable(
  'core_findings',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    engagementId: uuid('engagement_id').notNull(),
    front: orbitFrontEnum('front').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    evidenceKind: evidenceKindEnum('evidence_kind'),
    evidencePath: text('evidence_path'),
    evidenceValue: text('evidence_value'),
    evidenceNote: text('evidence_note'),
    impact: coreLevelEnum('impact').notNull(),
    effort: coreLevelEnum('effort').notNull(),
    lane: roadmapLaneEnum('lane').notNull(),
    owner: findingOwnerEnum('owner').notNull(),
    bringToCall: boolean('bring_to_call').notNull().default(false),
    position: integer('position').notNull().default(0),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.engagementId, table.clientId],
      foreignColumns: [coreEngagements.id, coreEngagements.clientId],
      name: 'core_findings_engagement_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'core_findings_client_organization_fk',
    }).onDelete('restrict'),
    index('core_findings_engagement_idx').on(table.engagementId, table.front),
    check(
      'core_findings_evidence_shape',
      sql`(${table.evidenceKind} is null and ${table.evidencePath} is null and ${table.evidenceValue} is null)
        or (${table.evidenceKind} = 'file' and ${table.evidencePath} is not null)
        or (${table.evidenceKind} <> 'file' and ${table.evidenceValue} is not null)`,
    ),
  ],
).enableRLS();

export const coreScores = pgTable(
  'core_scores',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    engagementId: uuid('engagement_id').notNull(),
    front: orbitFrontEnum('front').notNull(),
    criterionId: text('criterion_id').notNull(),
    points: integer('points').notNull(),
    justification: text('justification').notNull(),
    updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.engagementId, table.clientId],
      foreignColumns: [coreEngagements.id, coreEngagements.clientId],
      name: 'core_scores_engagement_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'core_scores_client_organization_fk',
    }).onDelete('restrict'),
    unique('core_scores_criterion_key').on(table.engagementId, table.front, table.criterionId),
    check('core_scores_points_range', sql`${table.points} between 0 and 25`),
  ],
).enableRLS();
