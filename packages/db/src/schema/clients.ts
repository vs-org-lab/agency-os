import { index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, id, timestamps } from './columns';
import { organizations } from './organizations';

export const clients = pgTable(
  'clients',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    sector: text('sector'),
    size: text('size'),
    logoPath: text('logo_path'),
    portalDomain: text('portal_domain').unique(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    index('clients_organization_id_idx').on(table.organizationId),
    unique('clients_id_organization_id_key').on(table.id, table.organizationId),
  ],
).enableRLS();
