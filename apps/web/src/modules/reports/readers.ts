import { sql } from 'drizzle-orm';
import type { DbTransaction } from '@agency-os/db';
import {
  PIPELINE_STAGES,
  stageOf,
  type PipelineCode,
  type PipelineStage,
} from '@/modules/commercial';
import { listTeam } from '@/modules/team/server';
import type { VerifiedClaims } from '@/platform/db';
import { lisbonDay, nowOf, reportsActor, type ReportsDeps } from './access';
import { conversion, type ConversionRow } from './domain/conversion';
import { revenueByMonth, type RevenueRow } from './domain/months';

export type ReportsView = {
  year: number;
  revenue: RevenueRow[];
  recurring: { currency: string; monthly: string; retainers: number }[];
  pipeline: { stage: PipelineStage; codes: { code: PipelineCode; deals: number }[] }[];
  conversion: ConversionRow[];
  load: {
    userId: string;
    name: string;
    tasksThisWeek: number;
    activeProjects: number;
    weeklyHours: number | null;
  }[];
  atRisk: { clientId: string; name: string; score: number; scoreBefore: number | null }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const shift = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

async function revenue(tx: DbTransaction, organizationId: string, year: number) {
  const rows = await tx.execute<{ received_on: string; amount: string; currency: string }>(sql`
    select received_on::text, amount::text, currency from public.payments
    where organization_id = ${organizationId}::uuid and status = 'reconciled'
      and received_on between ${`${year}-01-01`}::date and ${`${year}-12-31`}::date
  `);
  return revenueByMonth(
    rows.map((row) => ({
      receivedOn: row.received_on,
      amount: row.amount,
      currency: row.currency,
    })),
    year,
  );
}

async function recurring(tx: DbTransaction, organizationId: string, today: string) {
  const rows = await tx.execute<{ currency: string; monthly: string; retainers: number }>(sql`
    select currency::text, sum(monthly_fee)::numeric(14,2)::text as monthly,
           count(*)::int as retainers
    from public.retainers
    where organization_id = ${organizationId}::uuid and status = 'active'
      and starts_on <= ${today}::date
    group by currency
    order by currency
  `);
  return rows.map((row) => ({
    currency: row.currency,
    monthly: row.monthly,
    retainers: row.retainers,
  }));
}

async function pipeline(tx: DbTransaction, organizationId: string) {
  const rows = await tx.execute<{ code: PipelineCode; deals: number }>(sql`
    select pipeline_code::text as code, count(*)::int as deals from public.deals
    where organization_id = ${organizationId}::uuid and archived_at is null
    group by pipeline_code
  `);
  const counts = new Map(rows.map((row) => [row.code, row.deals]));
  return PIPELINE_STAGES.map(({ stage, codes }) => ({
    stage,
    codes: codes
      .filter((code) => counts.has(code))
      .map((code) => ({ code, deals: counts.get(code) ?? 0 })),
  })).filter((group) => group.codes.length > 0);
}

/** Entering a stage is the first change to one of its codes; pre-sale starts at creation. */
async function stageEntries(tx: DbTransaction, organizationId: string) {
  const rows = await tx.execute<{ deal_id: string; code: PipelineCode | null; at: string }>(sql`
    select d.id as deal_id, null as code,
           (d.created_at at time zone 'Europe/Lisbon')::date::text as at
    from public.deals d
    where d.organization_id = ${organizationId}::uuid and d.archived_at is null
    union all
    select c.deal_id, c.to_code::text, (c.created_at at time zone 'Europe/Lisbon')::date::text
    from public.deal_stage_changes c
    join public.deals d on d.id = c.deal_id
    where c.organization_id = ${organizationId}::uuid and d.archived_at is null
  `);
  return rows.map((row) => ({
    dealId: row.deal_id,
    stage: row.code === null ? ('pre_sale' as const) : stageOf(row.code),
    at: row.at,
  }));
}

async function atRisk(tx: DbTransaction, organizationId: string, today: string) {
  const rows = await tx.execute<{
    client_id: string;
    name: string;
    score: number;
    score_before: number | null;
  }>(sql`
    select latest.client_id, c.name, latest.score,
           (select s.score from public.client_health_snapshots s
            where s.client_id = latest.client_id and s.score is not null
              and s.day between ${shift(today, -30)}::date and latest.day - 1
            order by s.day limit 1) as score_before
    from (
      select distinct on (client_id) client_id, day, score, level
      from public.client_health_snapshots
      where organization_id = ${organizationId}::uuid
      order by client_id, day desc
    ) latest
    join public.clients c on c.id = latest.client_id
    where latest.level = 'at_risk'
    order by latest.score, c.name
  `);
  return rows.map((row) => ({
    clientId: row.client_id,
    name: row.name,
    score: row.score,
    scoreBefore: row.score_before,
  }));
}

/** S-11 (RF-131): the six team panels for a Lisbon year, for founders only. */
export async function loadReports(
  claims: VerifiedClaims,
  year: number,
  deps: ReportsDeps,
): Promise<ReportsView | null> {
  const actor = await reportsActor(claims, deps);
  if (!actor) return null;
  const now = nowOf(deps);
  const today = lisbonDay(now);
  const team = await listTeam(claims, now, { contexts: deps.contexts });

  const panels = await deps.contexts.withSystemContext(async (tx) => ({
    revenue: await revenue(tx, actor.organizationId, year),
    recurring: await recurring(tx, actor.organizationId, today),
    pipeline: await pipeline(tx, actor.organizationId),
    conversion: conversion(await stageEntries(tx, actor.organizationId), year),
    atRisk: await atRisk(tx, actor.organizationId, today),
  }));
  return {
    year,
    ...panels,
    load: (team ?? [])
      .filter((member) => member.status === 'active')
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        tasksThisWeek: member.load.tasksThisWeek,
        activeProjects: member.load.activeProjects,
        weeklyHours: member.rates?.weeklyHours ?? null,
      })),
  };
}
