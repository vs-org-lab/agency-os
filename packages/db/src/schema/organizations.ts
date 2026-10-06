import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { archivedAt, id, timestamps } from './columns';
import { currencyEnum, localeEnum } from './enums';

export type PortalBranding = {
  displayName?: string;
  logoPath?: string;
};

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  defaultLocale: localeEnum('default_locale').notNull().default('pt-PT'),
  defaultCurrency: currencyEnum('default_currency').notNull().default('EUR'),
  portalBranding: jsonb('portal_branding').$type<PortalBranding>().notNull().default({}),
  ...timestamps,
  archivedAt: archivedAt(),
}).enableRLS();
