import { sql } from 'drizzle-orm';
import type { DbTransaction } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import { healthReader, lisbonDay, nowOf, type HealthDeps } from './access';
import { healthScore, type HealthLevel } from './domain/score';
import { healthTrend, TREND_WINDOW_DAYS } from './domain/trend';
import {
  approvalsSignal,
  outcomeSignal,
  paymentsSignal,
  responsesSignal,
  type Signal,
} from './domain/signals';

export type ClientHealthView = {
  score: number | null;
  /** The change against the earliest snapshot of the last 30 days, or null without one. */
  trend: number | null;
  level: HealthLevel | null;
  signals: {
    payments: Signal | null;
    approvals: Signal | null;
    responses: Signal | null;
    outcome: Signal | null;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENTS_WINDOW_DAYS = 365;
const ACTIVITY_WINDOW_DAYS = 183;
const REPLY_WINDOW_DAYS = 14;

const shift = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

async function payments(tx: DbTransaction, clientId: string, today: string) {
  const rows = await tx.execute<{ due_date: string; paid_on: string | null }>(sql`
    select due_date::text,
           case when paid_at is not null
                then (paid_at at time zone 'Europe/Lisbon')::date::text end as paid_on
    from public.payment_requests
    where client_id = ${clientId}::uuid and status <> 'void'
      and (
        -- An open request is late only after its due date, and stays late however old it is.
        (status = 'sent' and due_date < ${today}::date)
        or (paid_at is not null
            and due_date between ${shift(today, -PAYMENTS_WINDOW_DAYS)}::date and ${today}::date)
      )
  `);
  return paymentsSignal(rows.map((row) => ({ dueDate: row.due_date, paidOn: row.paid_on })));
}

async function approvals(tx: DbTransaction, clientId: string, now: Date) {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);
  const rows = await tx.execute<{ requested_at: string | Date; decided_at: string | Date | null }>(
    sql`
      select requested_at, decided_at from public.approvals
      where client_id = ${clientId}::uuid and status <> 'withdrawn'
        and requested_at <= ${now.toISOString()}::timestamptz
        -- A pending approval keeps counting however long ago it was asked for.
        and (requested_at >= ${since.toISOString()}::timestamptz or status = 'pending')
    `,
  );
  return approvalsSignal(
    rows.map((row) => {
      const end = row.decided_at ? new Date(row.decided_at).getTime() : now.getTime();
      return (end - new Date(row.requested_at).getTime()) / DAY_MS;
    }),
  );
}

/**
 * Hours from each visible team comment on a proof version or a document to the client's next
 * visible comment on the same one, when it comes within 14 days; unanswered comments are left out.
 */
async function responses(tx: DbTransaction, clientId: string, now: Date) {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = await tx.execute<{ hours: string }>(sql`
    with comments as (
      select c.document_id::text as thread, c.created_at, p.kind::text as author_kind
      from public.project_document_comments c
      join public.profiles p on p.id = c.author_id
      where c.client_id = ${clientId}::uuid and not c.internal
      union all
      select c.version_id::text, c.created_at, p.kind::text
      from public.proof_comments c
      join public.profiles p on p.id = c.author_id
      where c.client_id = ${clientId}::uuid and not c.internal
    )
    select extract(epoch from (reply.at - team.created_at)) / 3600 as hours
    from comments team
    cross join lateral (
      select min(answer.created_at) as at from comments answer
      where answer.thread = team.thread and answer.author_kind = 'client'
        and answer.created_at > team.created_at
        and answer.created_at <= team.created_at + make_interval(days => ${REPLY_WINDOW_DAYS})
    ) reply
    where team.author_kind = 'internal' and reply.at is not null
      and team.created_at >= ${since}::timestamptz
      and team.created_at <= ${now.toISOString()}::timestamptz
  `);
  return responsesSignal(rows.map((row) => Number(row.hours)));
}

async function outcome(tx: DbTransaction, clientId: string, today: string) {
  const [row] = await tx.execute<{
    baseline: string;
    target: string;
    deadline: string;
    created_on: string;
    guarantee_status: string;
    guarantee_reason: string | null;
    latest: string | null;
  }>(sql`
    select o.baseline::text, o.target::text, o.deadline::text,
           (o.created_at at time zone 'Europe/Lisbon')::date::text as created_on,
           o.guarantee_status::text, o.guarantee_reason::text,
           (select m.value::text from public.outcome_measurements m
            where m.outcome_id = o.id order by m.measured_on desc limit 1) as latest
    from public.project_outcomes o
    where o.client_id = ${clientId}::uuid
    order by o.created_at desc
    limit 1
  `);
  if (!row) return null;
  return outcomeSignal({
    baseline: Number(row.baseline),
    target: Number(row.target),
    latest: row.latest === null ? null : Number(row.latest),
    createdOn: row.created_on,
    deadline: row.deadline,
    today,
    guarantee: { status: row.guarantee_status, reason: row.guarantee_reason },
  });
}

/**
 * RF-160: the client's health from payments on time, approval time, response time and the
 * outcome's progress, in the caller's transaction and without authorization; callers check access.
 */
export async function computeClientHealth(
  tx: DbTransaction,
  clientId: string,
  now: Date,
): Promise<Omit<ClientHealthView, 'trend'>> {
  const today = lisbonDay(now);
  const signals = {
    payments: await payments(tx, clientId, today),
    approvals: await approvals(tx, clientId, now),
    responses: await responses(tx, clientId, now),
    outcome: await outcome(tx, clientId, today),
  };
  return {
    ...healthScore([signals.payments, signals.approvals, signals.responses, signals.outcome]),
    signals,
  };
}

/** The earliest snapshot score of the last 30 days, which the trend compares with. */
async function pastScore(tx: DbTransaction, clientId: string, today: string) {
  const [row] = await tx.execute<{ score: number }>(sql`
    select score from public.client_health_snapshots
    where client_id = ${clientId}::uuid and score is not null
      and day between ${shift(today, -TREND_WINDOW_DAYS)}::date and ${shift(today, -1)}::date
    order by day
    limit 1
  `);
  return row?.score ?? null;
}

/**
 * RF-160 on C-01: the client's health and its trend over 30 days, for the room's readers who also
 * read billing; others get null.
 */
export async function loadClientHealth(
  claims: VerifiedClaims,
  clientId: string,
  deps: HealthDeps,
): Promise<ClientHealthView | null> {
  const reader = await healthReader(claims, clientId, deps);
  if (!reader) return null;
  const now = nowOf(deps);

  return deps.contexts.withSystemContext(async (tx) => {
    const health = await computeClientHealth(tx, clientId, now);
    const past = await pastScore(tx, clientId, lisbonDay(now));
    return { ...health, trend: healthTrend(health.score, past) };
  });
}
