import { foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import { deals } from './deals';
import { documentKindEnum, documentStatusEnum } from './enums';
import { profiles } from './profiles';

export const documents = pgTable(
  'documents',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    dealId: uuid('deal_id'),
    kind: documentKindEnum('kind').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    status: documentStatusEnum('status').notNull().default('draft'),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    authorId: uuid('author_id').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.dealId, table.clientId],
      foreignColumns: [deals.id, deals.clientId],
      name: 'documents_deal_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'documents_client_organization_fk',
    }).onDelete('restrict'),
    index('documents_client_status_idx').on(table.clientId, table.status),
  ],
).enableRLS();
