import { sql } from 'drizzle-orm';
import type { DbTransaction } from '@agency-os/db';
import { limitMonths } from '@/modules/retainers/server';
import { updateTitle, type ReportData } from './domain/content';
import type { ReportPeriod } from './domain/periods';

const lisbonDay = (column: string) => sql.raw(`(${column} at time zone 'Europe/Lisbon')::date`);

/** The report's project: the active retainer's, otherwise the client's most recent one. */
export async function reportProject(tx: DbTransaction, clientId: string): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    select p.id from public.projects p
    left join public.retainers r on r.project_id = p.id and r.status = 'active'
    where p.client_id = ${clientId}::uuid
    order by (r.id is not null) desc, p.created_at desc
    limit 1
  `);
  return row?.id ?? null;
}

function monthsOf(period: ReportPeriod, from: string): string[] {
  const months: string[] = [];
  for (let cursor = new Date(`${period.start}T00:00:00Z`); ;) {
    const month = cursor.toISOString().slice(0, 10);
    if (month > period.end) return months;
    if (month >= from) months.push(month);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
}

async function retainerUsage(tx: DbTransaction, clientId: string, period: ReportPeriod) {
  const [retainer] = await tx.execute<{ id: string; starts_on: string }>(sql`
    select id, starts_on::text from public.retainers
    where client_id = ${clientId}::uuid and status = 'active'
  `);
  if (!retainer) return null;
  const startMonth = `${retainer.starts_on.slice(0, 7)}-01`;
  const months = [];
  for (const month of monthsOf(period, startMonth)) {
    const limits = await limitMonths(tx, { id: retainer.id, startsOn: retainer.starts_on }, month);
    months.push({
      month,
      limits: limits.map((limit) => ({
        kind: limit.kind,
        used: limit.used,
        available: limit.available,
      })),
    });
  }
  return months;
}

async function outcome(tx: DbTransaction, clientId: string, period: ReportPeriod) {
  const [row] = await tx.execute<{
    id: string;
    metric: string;
    baseline: string;
    target: string;
    deadline: string;
  }>(sql`
    select o.id, o.metric, o.baseline::text, o.target::text, o.deadline::text
    from public.project_outcomes o
    left join public.retainers r on r.project_id = o.project_id and r.status = 'active'
    where o.client_id = ${clientId}::uuid
    order by (r.id is not null) desc, o.created_at desc
    limit 1
  `);
  if (!row) return null;
  const measurements = await tx.execute<{ on: string; value: string }>(sql`
    select measured_on::text as on, value::text from public.outcome_measurements
    where outcome_id = ${row.id}::uuid
      and measured_on between ${period.start}::date and ${period.end}::date
    order by measured_on
  `);
  return {
    metric: row.metric,
    baseline: row.baseline,
    target: row.target,
    deadline: row.deadline,
    measurements: measurements.map((entry) => ({ on: entry.on, value: entry.value })),
  };
}

/**
 * What happened for the client in the period (RF-130), read in the system context after the
 * caller's authorisation. Only what the client already sees enters: steps shown to the client,
 * client updates and approved documents. Health, money and internal work stay out.
 */
export async function collectReportData(
  tx: DbTransaction,
  input: { clientId: string; period: ReportPeriod },
): Promise<ReportData> {
  const { clientId, period } = input;
  const within = (column: string) =>
    sql`${lisbonDay(column)} between ${period.start}::date and ${period.end}::date`;

  const steps = await tx.execute<{ name: string; on: string }>(sql`
    select name, ${lisbonDay('completed_at')}::text as on from public.project_steps
    where client_id = ${clientId}::uuid and visible_to_client and status = 'done'
      and ${within('completed_at')}
    order by completed_at, name
  `);
  const updates = await tx.execute<{ milestone: string | null; body: string; on: string }>(sql`
    select milestone, body, ${lisbonDay('created_at')}::text as on from public.project_updates
    where client_id = ${clientId}::uuid and visibility = 'client' and ${within('created_at')}
    order by created_at
  `);
  const approvals = await tx.execute<{ title: string; on: string }>(sql`
    select title, ${lisbonDay('approved_at')}::text as on from public.project_documents
    where client_id = ${clientId}::uuid and approved_at is not null and ${within('approved_at')}
    order by approved_at, title
  `);

  return {
    steps: steps.map((step) => ({ name: step.name, on: step.on })),
    updates: updates.map((update) => ({ title: updateTitle(update), on: update.on })),
    approvals: approvals.map((item) => ({ title: item.title, on: item.on })),
    retainer: await retainerUsage(tx, clientId, period),
    outcome: await outcome(tx, clientId, period),
  };
}
