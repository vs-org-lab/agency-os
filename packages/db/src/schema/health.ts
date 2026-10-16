import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { healthLevelEnum } from './enums';

/** A client's health on one day (RF-160), kept for its trend and the at-risk alert. */
export const clientHealthSnapshots = pgTable(
  'client_health_snapshots',
  {
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    day: date('day').notNull(),
    score: integer('score'),
    level: healthLevelEnum('level'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.day], name: 'client_health_snapshots_pkey' }),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_health_snapshots_client_organization_fk',
    }).onDelete('cascade'),
    check(
      'client_health_snapshots_score_range',
      sql`${table.score} is null or ${table.score} between 0 and 100`,
    ),
    check(
      'client_health_snapshots_level_with_score',
      sql`(${table.score} is null) = (${table.level} is null)`,
    ),
  ],
).enableRLS();
