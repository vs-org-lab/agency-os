import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { testimonialVideoStatusEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';
import { projects } from './rooms';

/** What the client's decision maker says about a delivered project (AUT-21); one per project. */
export const testimonials = pgTable(
  'testimonials',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    authorName: text('author_name').notNull(),
    authorRole: text('author_role').notNull(),
    consentPublish: boolean('consent_publish').notNull().default(false),
    videoPath: text('video_path'),
    videoContentType: text('video_content_type'),
    videoDurationSeconds: integer('video_duration_seconds'),
    /** Where each question started in the recording: [{ index, startedAtMs }]. */
    chapters: jsonb('chapters'),
    videoStatus: testimonialVideoStatusEnum('video_status'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'testimonials_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'testimonials_project_client_fk',
    }).onDelete('cascade'),
    unique('testimonials_project_key').on(table.projectId),
    check(
      'testimonials_body_length',
      sql`char_length(${table.body}) between 1 and 1000
        or (${table.videoStatus} is not null and char_length(${table.body}) <= 1000)`,
    ),
    check(
      'testimonials_video_columns',
      sql`(${table.videoStatus} is null) = (${table.videoPath} is null)
        and (${table.videoDurationSeconds} is null or ${table.videoDurationSeconds} between 1 and 300)`,
    ),
    check(
      'testimonials_author_name_length',
      sql`char_length(${table.authorName}) between 1 and 120`,
    ),
    check(
      'testimonials_author_role_length',
      sql`char_length(${table.authorRole}) between 0 and 120`,
    ),
  ],
).enableRLS();
