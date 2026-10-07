import { sql } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { clientRoleEnum } from './enums';
import { profiles } from './profiles';

export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    jobTitle: text('job_title'),
    role: clientRoleEnum('role').notNull(),
    portalUserId: uuid('portal_user_id').references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'contacts_client_organization_fk',
    }).onDelete('restrict'),
    uniqueIndex('contacts_client_email_key')
      .on(table.clientId, sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
    index('contacts_organization_email_idx').on(table.organizationId, sql`lower(${table.email})`),
  ],
).enableRLS();
