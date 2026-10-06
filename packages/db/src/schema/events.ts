import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';
import { eventStatusEnum } from './enums';
import { organizations } from './organizations';

export const domainEvents = pgTable(
  'domain_events',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id'),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: eventStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('domain_events_status_created_idx').on(table.status, table.createdAt)],
).enableRLS();
