import { sql } from 'drizzle-orm';
import type { VerifiedClaims } from '@/platform/db';
import { nowOf, retainerReader, retainerWriter, seesFee, type RetainersDeps } from './access';
import type { RetainerLimitKind } from './domain/kinds';
import { lisbonMonth, monthProgress, type MonthProgress } from './domain/months';
import { limitMonths, type LimitMonth } from './month';

export type RetainerUsageRow = {
  id: string;
  kind: RetainerLimitKind;
  quantity: number;
  description: string;
  extra: boolean;
  createdAt: string;
};

export type RetainerExtraRow = {
  id: string;
  kind: RetainerLimitKind;
  description: string;
  quantity: number;
  quoteAmount: string | null;
  currency: string | null;
  status: 'requested' | 'quoted' | 'approved' | 'declined';
  createdAt: string;
};

/** C-10: the client's retainer for the room's staff; the fee only for who may see values. */
export type StaffRetainerView = {
  canWrite: boolean;
  canSeeFee: boolean;
  month: string;
  period: MonthProgress;
  projects: { id: string; name: string }[];
  retainer: {
    id: string;
    projectId: string;
    tier: string;
    monthlyFee: string | null;
    currency: string;
    startsOn: string;
    reviewOn: string;
    status: 'active' | 'ended';
  } | null;
  limits: LimitMonth[];
  usage: RetainerUsageRow[];
  extraRequests: RetainerExtraRow[];
};

type RetainerRow = {
  id: string;
  project_id: string;
  tier: string;
  monthly_fee: string;
  currency: string;
  starts_on: string;
  review_on: string;
  status: 'active' | 'ended';
};

export async function loadStaffRetainer(
  claims: VerifiedClaims,
  clientId: string,
  deps: RetainersDeps,
): Promise<StaffRetainerView | null> {
  const reader = await retainerReader(claims, clientId, deps);
  if (!reader) return null;
  const writer = await retainerWriter(claims, clientId, deps);
  const canSeeFee = seesFee(reader);
  const now = nowOf(deps);
  const month = lisbonMonth(now);

  return deps.contexts.withSystemContext(async (tx) => {
    const projects = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from public.projects
      where client_id = ${clientId}::uuid and organization_id = ${reader.organizationId}::uuid
      order by created_at
    `);
    const [retainer] = await tx.execute<RetainerRow>(sql`
      select id, project_id, tier, monthly_fee::text, currency::text, starts_on::text,
             review_on::text, status::text
      from public.retainers
      where client_id = ${clientId}::uuid and organization_id = ${reader.organizationId}::uuid
      order by status = 'ended', created_at desc
      limit 1
    `);
    if (!retainer) {
      return {
        canWrite: writer !== null,
        canSeeFee,
        month,
        period: monthProgress(now),
        projects: [...projects],
        retainer: null,
        limits: [],
        usage: [],
        extraRequests: [],
      };
    }
    const limits = await limitMonths(tx, { id: retainer.id, startsOn: retainer.starts_on }, month);
    const usage = await tx.execute<{
      id: string;
      kind: RetainerLimitKind;
      quantity: string;
      description: string;
      extra: boolean;
      created_at: string | Date;
    }>(sql`
      select id, kind::text, quantity::text, description, extra_request_id is not null as extra,
             created_at
      from public.retainer_usage
      where retainer_id = ${retainer.id}::uuid and month = ${month}::date
      order by created_at desc
    `);
    const extras = await tx.execute<{
      id: string;
      kind: RetainerLimitKind;
      description: string;
      quantity: string;
      quote_amount: string | null;
      currency: string | null;
      status: RetainerExtraRow['status'];
      created_at: string | Date;
    }>(sql`
      select id, kind::text, description, quantity::text, quote_amount::text, currency::text,
             status::text, created_at
      from public.retainer_extra_requests
      where retainer_id = ${retainer.id}::uuid
      order by created_at desc
    `);
    return {
      canWrite: writer !== null,
      canSeeFee,
      month,
      period: monthProgress(now),
      projects: [...projects],
      retainer: {
        id: retainer.id,
        projectId: retainer.project_id,
        tier: retainer.tier,
        monthlyFee: canSeeFee ? retainer.monthly_fee : null,
        currency: retainer.currency,
        startsOn: retainer.starts_on,
        reviewOn: retainer.review_on,
        status: retainer.status,
      },
      limits,
      usage: usage.map((row) => ({
        id: row.id,
        kind: row.kind,
        quantity: Number(row.quantity),
        description: row.description,
        extra: row.extra,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      extraRequests: extras.map((row) => ({
        id: row.id,
        kind: row.kind,
        description: row.description,
        quantity: Number(row.quantity),
        quoteAmount: canSeeFee ? row.quote_amount : null,
        currency: canSeeFee ? row.currency : null,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  });
}
