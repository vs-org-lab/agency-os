import { sql } from 'drizzle-orm';
import {
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
  uuid,
} from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { id, timestamps } from './columns';
import {
  guaranteeReasonEnum,
  guaranteeStatusEnum,
  outcomeConditionKindEnum,
  outcomeConditionStatusEnum,
} from './enums';
import { profiles } from './profiles';
import { projects } from './rooms';

/** A project's agreed outcome and the state of its guarantee (RF-120, RF-123). */
export const projectOutcomes = pgTable(
  'project_outcomes',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id').notNull(),
    metric: text('metric').notNull(),
    unit: text('unit').notNull().default(''),
    baseline: numeric('baseline', { precision: 14, scale: 2 }).notNull(),
    target: numeric('target', { precision: 14, scale: 2 }).notNull(),
    deadline: date('deadline').notNull(),
    dataSource: text('data_source').notNull(),
    guaranteeStatus: guaranteeStatusEnum('guarantee_status').notNull().default('pending'),
    guaranteeReason: guaranteeReasonEnum('guarantee_reason'),
    activatedOn: date('activated_on'),
    monthsUsed: integer('months_used').notNull().default(0),
    /** The deadline whose "decide the conditions" task was already created. */
    conditionsTaskFor: date('conditions_task_for'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.clientId, table.organizationId],
      foreignColumns: [clients.id, clients.organizationId],
      name: 'project_outcomes_client_organization_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.projectId, table.clientId],
      foreignColumns: [projects.id, projects.clientId],
      name: 'project_outcomes_project_client_fk',
    }).onDelete('cascade'),
    unique('project_outcomes_project_key').on(table.projectId),
    unique('project_outcomes_id_client_key').on(table.id, table.clientId),
    index('project_outcomes_client_idx').on(table.clientId),
    check('project_outcomes_metric_length', sql`char_length(${table.metric}) between 1 and 80`),
    check('project_outcomes_unit_length', sql`char_length(${table.unit}) <= 20`),
    check(
      'project_outcomes_source_length',
      sql`char_length(${table.dataSource}) between 1 and 120`,
    ),
    check('project_outcomes_target_differs', sql`${table.baseline} <> ${table.target}`),
    check(
      'project_outcomes_reason',
      sql`case ${table.guaranteeStatus}
            when 'pending' then ${table.guaranteeReason} is null
            when 'active' then ${table.guaranteeReason} is null
            when 'not_activated'
              then coalesce(${table.guaranteeReason}::text, '') in ('target_met', 'conditions_failed')
            else coalesce(${table.guaranteeReason}::text, '') in ('target_met', 'months_used')
          end`,
    ),
    check(
      'project_outcomes_activation',
      sql`(${table.activatedOn} is not null) = (${table.guaranteeStatus} in ('active', 'closed'))`,
    ),
    check(
      'project_outcomes_months',
      sql`${table.monthsUsed} between 0 and 3
          and (${table.guaranteeReason} is distinct from 'months_used' or ${table.monthsUsed} = 3)`,
    ),
  ],
).enableRLS();

/** A client condition of the guarantee, recorded with its date (RF-121, RN-71). */
export const outcomeConditions = pgTable(
  'outcome_conditions',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    outcomeId: uuid('outcome_id').notNull(),
    kind: outcomeConditionKindEnum('kind').notNull(),
    description: text('description').notNull(),
    status: outcomeConditionStatusEnum('status').notNull().default('pending'),
    recordedOn: date('recorded_on'),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.outcomeId, table.clientId],
      foreignColumns: [projectOutcomes.id, projectOutcomes.clientId],
      name: 'outcome_conditions_outcome_client_fk',
    }).onDelete('cascade'),
    index('outcome_conditions_outcome_idx').on(table.outcomeId),
    check(
      'outcome_conditions_description_length',
      sql`char_length(${table.description}) between 1 and 200`,
    ),
    check(
      'outcome_conditions_note_length',
      sql`${table.note} is null or char_length(${table.note}) <= 500`,
    ),
    check(
      'outcome_conditions_failed_note',
      sql`${table.status} <> 'failed' or char_length(coalesce(${table.note}, '')) > 0`,
    ),
    check(
      'outcome_conditions_recorded',
      sql`(${table.status} = 'pending') = (${table.recordedOn} is null)`,
    ),
  ],
).enableRLS();

/** A value of the outcome's metric on a date (RF-122). */
export const outcomeMeasurements = pgTable(
  'outcome_measurements',
  {
    id: id(),
    organizationId: uuid('organization_id').notNull(),
    clientId: uuid('client_id').notNull(),
    outcomeId: uuid('outcome_id').notNull(),
    measuredOn: date('measured_on').notNull(),
    value: numeric('value', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.outcomeId, table.clientId],
      foreignColumns: [projectOutcomes.id, projectOutcomes.clientId],
      name: 'outcome_measurements_outcome_client_fk',
    }).onDelete('cascade'),
    unique('outcome_measurements_outcome_date_key').on(table.outcomeId, table.measuredOn),
    check(
      'outcome_measurements_note_length',
      sql`${table.note} is null or char_length(${table.note}) <= 500`,
    ),
  ],
).enableRLS();
