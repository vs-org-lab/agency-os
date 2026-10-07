import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { schema, type DbTransaction, type NextStepOwnerKind } from '@agency-os/db';
import type { Currency } from '@agency-os/i18n';
import { PIPELINE_STAGES, type PipelineCode, type PipelineStage } from './pipeline/codes';

const { clients, deals, profiles } = schema;

export type PipelineCard = {
  dealId: string;
  clientName: string;
  code: PipelineCode;
  estimatedValue: string | null;
  currency: Currency;
  nextStep: string | null;
  ownerKind: NextStepOwnerKind | null;
  ownerLabel: string | null;
  dueOn: string | null;
  overdue: boolean;
};

export type PipelineFilters = {
  stage?: PipelineStage;
  ownerUserId?: string;
  overdueOnly?: boolean;
  search?: string;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listPipelineDeals(
  tx: DbTransaction,
  filters: PipelineFilters,
): Promise<PipelineCard[]> {
  const conditions: SQL[] = [isNull(deals.archivedAt)];
  if (filters.stage) {
    const codes = PIPELINE_STAGES.find((entry) => entry.stage === filters.stage)?.codes ?? [];
    conditions.push(inArray(deals.pipelineCode, [...codes]));
  }
  if (filters.ownerUserId) conditions.push(eq(deals.nextStepOwnerUserId, filters.ownerUserId));
  if (filters.overdueOnly) conditions.push(sql`${deals.nextStepDueOn} < current_date`);
  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const match = or(ilike(clients.name, pattern), ilike(deals.title, pattern));
    if (match) conditions.push(match);
  }

  const rows = await tx
    .select({
      dealId: deals.id,
      clientName: clients.name,
      code: deals.pipelineCode,
      estimatedValue: deals.estimatedValue,
      currency: deals.currency,
      nextStep: deals.nextStep,
      ownerKind: deals.nextStepOwnerKind,
      ownerName: profiles.fullName,
      dueOn: deals.nextStepDueOn,
      overdue: sql<boolean>`coalesce(${deals.nextStepDueOn} < current_date, false)`,
    })
    .from(deals)
    .innerJoin(clients, eq(clients.id, deals.clientId))
    .leftJoin(profiles, eq(profiles.id, deals.nextStepOwnerUserId))
    .where(and(...conditions))
    .orderBy(desc(deals.updatedAt));

  return rows.map((row) => ({
    dealId: row.dealId,
    clientName: row.clientName,
    code: row.code,
    estimatedValue: row.estimatedValue,
    currency: row.currency,
    nextStep: row.nextStep,
    ownerKind: row.ownerKind,
    ownerLabel: row.ownerKind === 'staff' ? (row.ownerName ?? null) : null,
    dueOn: row.dueOn,
    overdue: row.overdue,
  }));
}
