import { index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns';
import { actorKindEnum } from './enums';
import { organizations } from './organizations';

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    actorUserId: uuid('actor_user_id'),
    actorKind: actorKindEnum('actor_kind').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    clientId: uuid('client_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_organization_occurred_idx').on(table.organizationId, table.occurredAt),
    index('audit_log_client_id_idx').on(table.clientId),
    index('audit_log_actor_user_id_idx').on(table.actorUserId),
  ],
).enableRLS();
