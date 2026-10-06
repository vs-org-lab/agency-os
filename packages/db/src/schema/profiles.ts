import { foreignKey, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';
import { archivedAt, timestamps } from './columns';
import { localeEnum, profileKindEnum } from './enums';

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    fullName: text('full_name').notNull(),
    locale: localeEnum('locale'),
    kind: profileKindEnum('kind').notNull(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [authUsers.id],
      name: 'profiles_id_auth_users_fk',
    }).onDelete('restrict'),
  ],
).enableRLS();
