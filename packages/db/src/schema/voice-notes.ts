import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { voiceNoteStatusEnum, voiceNoteTargetEnum } from './enums';
import { profiles } from './profiles';
import { projects } from './rooms';

/**
 * A client's or teammate's spoken feedback on a proof comment or an approval change request. The
 * audio lives in a private bucket and is transcribed in the background.
 */
export const voiceNotes = pgTable(
  'voice_notes',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    targetKind: voiceNoteTargetEnum('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
    path: text('path').notNull(),
    contentType: text('content_type').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    status: voiceNoteStatusEnum('status').notNull().default('pending'),
    transcript: text('transcript'),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'voice_notes_project_client_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'voice_notes_client_organization_fk',
    }).onDelete('restrict'),
    index('voice_notes_target_idx').on(table.targetKind, table.targetId),
    index('voice_notes_project_idx').on(table.projectId, table.createdAt),
    check('voice_notes_duration', sql`${table.durationSeconds} between 1 and 180`),
    check(
      'voice_notes_content_type',
      sql`${table.contentType} in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg')`,
    ),
  ],
).enableRLS();
