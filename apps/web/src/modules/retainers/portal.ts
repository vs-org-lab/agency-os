import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { clientPaymentsSuspended } from '@/modules/billing/server';
import type { VerifiedClaims } from '@/platform/db';
import { nowOf, type RetainersDeps } from './access';
import type { RetainerLimitKind } from './domain/kinds';
import { lisbonDay, lisbonMonth } from './domain/months';
import { limitMonths, type LimitMonth } from './month';
import type { RetainerExtraRow } from './readers';

/** P-10: the month of the client's retainer, without its value; the decision maker decides. */
export type PortalRetainerView = {
  decides: boolean;
  /** RN-62: a payment more than 30 days overdue puts new requests on hold. */
  suspended: boolean;
  month: string;
  retainer: { id: string; tier: string; status: 'active' | 'ended' };
  limits: LimitMonth[];
  extraRequests: RetainerExtraRow[];
};

export async function loadPortalRetainer(
  claims: VerifiedClaims,
  clientId: string,
  deps: RetainersDeps,
): Promise<PortalRetainerView | null> {
  if (claims.user_kind !== 'client' || !z.uuid().safeParse(clientId).success) return null;
  const seen = await deps.contexts.withUserContext(claims, async (tx) => {
    const [retainer] = await tx.execute<{
      id: string;
      tier: string;
      status: 'active' | 'ended';
      starts_on: string;
      decides: boolean;
    }>(sql`
      select r.id, r.tier, r.status::text, r.starts_on::text,
             app.is_client_member(r.client_id, array['decision_maker']::app.client_role[])
               as decides
      from public.portal_retainers r
      where r.client_id = ${clientId}::uuid
      order by r.status = 'ended', r.starts_on desc
      limit 1
    `);
    if (!retainer) return null;
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
      from public.portal_retainer_extra_requests
      where retainer_id = ${retainer.id}::uuid
      order by created_at desc
    `);
    return { retainer, extras };
  });
  if (!seen) return null;
  const now = nowOf(deps);
  const month = lisbonMonth(now);
  const { limits, suspended } = await deps.contexts.withSystemContext(async (tx) => ({
    limits: await limitMonths(
      tx,
      { id: seen.retainer.id, startsOn: seen.retainer.starts_on },
      month,
    ),
    suspended: await clientPaymentsSuspended(tx, clientId, lisbonDay(now)),
  }));
  return {
    decides: seen.retainer.decides,
    suspended,
    month,
    retainer: { id: seen.retainer.id, tier: seen.retainer.tier, status: seen.retainer.status },
    limits,
    extraRequests: seen.extras.map((row) => ({
      id: row.id,
      kind: row.kind,
      description: row.description,
      quantity: Number(row.quantity),
      quoteAmount: row.quote_amount,
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
}
