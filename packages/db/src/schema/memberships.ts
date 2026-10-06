import { foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { clientRoleEnum, membershipStatusEnum, orgRoleEnum } from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    role: orgRoleEnum('role').notNull(),
    status: membershipStatusEnum('status').notNull().default('invited'),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    unique('organization_memberships_organization_user_key').on(table.organizationId, table.userId),
    index('organization_memberships_user_id_idx').on(table.userId),
  ],
).enableRLS();

export const clientMemberships = pgTable(
  'client_memberships',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    role: clientRoleEnum('role').notNull(),
    status: membershipStatusEnum('status').notNull().default('invited'),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_memberships_client_organization_fk',
    }).onDelete('restrict'),
    unique('client_memberships_client_user_key').on(table.clientId, table.userId),
    index('client_memberships_user_id_idx').on(table.userId),
    index('client_memberships_organization_id_idx').on(table.organizationId),
  ],
).enableRLS();

export const clientStaffAssignments = pgTable(
  'client_staff_assignments',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_staff_assignments_client_organization_fk',
    }).onDelete('restrict'),
    unique('client_staff_assignments_client_user_key').on(table.clientId, table.userId),
    index('client_staff_assignments_user_id_idx').on(table.userId),
    index('client_staff_assignments_organization_id_idx').on(table.organizationId),
  ],
).enableRLS();
