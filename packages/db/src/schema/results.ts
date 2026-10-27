import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { archivedAt, id, timestamps } from './columns';
import { kpiAggregationEnum, kpiFormatEnum, kpiValueOriginEnum } from './enums';
import { profiles } from './profiles';

/** A results indicator the team tracks for a client (spec RD-3). */
export const clientKpis = pgTable(
  'client_kpis',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    format: kpiFormatEnum('format').notNull().default('number'),
    aggregation: kpiAggregationEnum('aggregation').notNull().default('sum'),
    source: text('source').notNull().default(''),
    target: numeric('target', { precision: 16, scale: 4 }),
    clientVisible: boolean('client_visible').notNull().default(true),
    position: integer('position').notNull().default(0),
    archivedAt: archivedAt(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'client_kpis_client_organization_fk',
    }).onDelete('cascade'),
    unique('client_kpis_id_client_key').on(table.id, table.clientId),
    uniqueIndex('client_kpis_client_name_key')
      .on(table.clientId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    index('client_kpis_client_idx').on(table.clientId, table.position),
    check('client_kpis_name_length', sql`char_length(${table.name}) between 1 and 60`),
    check('client_kpis_source_length', sql`char_length(${table.source}) <= 40`),
  ],
).enableRLS();

/** The value of an indicator in a month, kept on the month's first day (spec RD-3). */
export const clientKpiValues = pgTable(
  'client_kpi_values',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    kpiId: uuid('kpi_id').notNull(),
    month: date('month').notNull(),
    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    origin: kpiValueOriginEnum('origin').notNull().default('manual'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    foreignKey({
      columns: [table.kpiId, table.clientId],
      foreignColumns: [clientKpis.id, clientKpis.clientId],
      name: 'client_kpi_values_kpi_client_fk',
    }).onDelete('cascade'),
    unique('client_kpi_values_kpi_month_key').on(table.kpiId, table.month),
    index('client_kpi_values_client_month_idx').on(table.clientId, table.month),
    check('client_kpi_values_first_day', sql`extract(day from ${table.month}) = 1`),
  ],
).enableRLS();
