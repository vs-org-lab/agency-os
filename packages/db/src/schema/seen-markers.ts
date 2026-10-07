import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns';
import { seenAreaEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const seenMarkers = pgTable(
  'seen_markers',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    area: seenAreaEnum('area').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('seen_markers_user_area_key').on(table.userId, table.organizationId, table.area),
  ],
).enableRLS();
