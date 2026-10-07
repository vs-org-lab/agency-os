import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import {
  acquisitionStatusEnum,
  calendarConnectionStatusEnum,
  localeEnum,
  messageTemplateKindEnum,
} from './enums';
import { organizations } from './organizations';
import { profiles } from './profiles';

export type WeeklyHours = Record<
  'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
  Array<{ start: string; end: string }>
>;

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: [{ start: '10:00', end: '18:00' }],
  tue: [{ start: '10:00', end: '18:00' }],
  wed: [{ start: '10:00', end: '18:00' }],
  thu: [{ start: '10:00', end: '18:00' }],
  fri: [{ start: '10:00', end: '18:00' }],
  sat: [],
  sun: [],
};

export const commercialSettings = pgTable(
  'commercial_settings',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    timeZone: text('time_zone').notNull().default('Europe/Lisbon'),
    weeklyHours: jsonb('weekly_hours').$type<WeeklyHours>().notNull().default(DEFAULT_WEEKLY_HOURS),
    durationMinutes: integer('duration_minutes').notNull().default(45),
    bufferMinutes: integer('buffer_minutes').notNull().default(15),
    minimumNoticeHours: integer('minimum_notice_hours').notNull().default(24),
    horizonDays: integer('horizon_days').notNull().default(14),
    hostUserId: uuid('host_user_id').references(() => profiles.id, { onDelete: 'restrict' }),
    selfDiagnosisUrl: text('self_diagnosis_url'),
    anonymizeAfterMonths: integer('anonymize_after_months').notNull().default(12),
    ...timestamps,
  },
  (table) => [
    check('commercial_settings_duration', sql`${table.durationMinutes} between 15 and 120`),
    check('commercial_settings_buffer', sql`${table.bufferMinutes} between 0 and 60`),
    check('commercial_settings_notice', sql`${table.minimumNoticeHours} between 0 and 168`),
    check('commercial_settings_horizon', sql`${table.horizonDays} between 1 and 60`),
    check('commercial_settings_retention', sql`${table.anonymizeAfterMonths} between 1 and 60`),
  ],
).enableRLS();

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    kind: messageTemplateKindEnum('kind').notNull(),
    sector: text('sector'),
    sequenceDay: integer('sequence_day'),
    locale: localeEnum('locale').notNull(),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    index('message_templates_organization_kind_idx').on(table.organizationId, table.kind),
  ],
).enableRLS();

export const acquisitionTargets = pgTable(
  'acquisition_targets',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    companyName: text('company_name').notNull(),
    sector: text('sector').notNull(),
    website: text('website'),
    notes: text('notes'),
    status: acquisitionStatusEnum('status').notNull().default('to_contact'),
    convertedClientId: uuid('converted_client_id').references(() => clients.id, {
      onDelete: 'restrict',
    }),
    ...timestamps,
    archivedAt: archivedAt(),
  },
  (table) => [
    index('acquisition_targets_organization_sector_idx').on(table.organizationId, table.sector),
  ],
).enableRLS();

export const calendarConnections = pgTable(
  'calendar_connections',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull().default('google'),
    accountEmail: text('account_email').notNull(),
    calendarId: text('calendar_id').notNull().default('primary'),
    vaultSecretId: uuid('vault_secret_id'),
    status: calendarConnectionStatusEnum('status').notNull().default('active'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [unique('calendar_connections_user_provider_key').on(table.userId, table.provider)],
).enableRLS();

export const capturedEmails = pgTable('captured_emails', {
  id: id(),
  organizationId: uuid('organization_id').references(() => organizations.id, {
    onDelete: 'restrict',
  }),
  recipient: text('recipient').notNull(),
  template: text('template').notNull(),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
