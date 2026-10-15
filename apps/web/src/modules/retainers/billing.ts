import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { issuePaymentRequest, signedContractFor } from '@/modules/billing/server';
import { requestFlush } from '@/modules/events';
import { logger } from '@/platform/logger';
import { nowOf, type RetainersDeps } from './access';
import { retainerExtraLabel, retainerMonthLabel } from './domain/labels';
import { lisbonMonth } from './domain/months';
import { lockRetainer } from './usage';

const { paymentRequests, projects, retainerExtraRequests } = schema;

export type IssuedRetainerRequests = { months: number; extras: number };

const NONE: IssuedRetainerRequests = { months: 0, extras: 0 };

/**
 * Issues what the retainer owes and has not been billed yet (spec 3B.2 §2.3, §2.4): the current
 * Lisbon month while the retainer is active and has started, and every approved extra request
 * with a quote. Each month and each extra request is billed once; a voided request counts as
 * billed. Nothing is issued while the client has no signed contract to fix the parties.
 */
export async function issueRetainerRequests(
  tx: DbTransaction,
  retainerId: string,
  deps: RetainersDeps,
  scope: 'all' | 'extras' = 'all',
): Promise<IssuedRetainerRequests> {
  const retainer = await lockRetainer(tx, retainerId);
  if (!retainer) return NONE;
  const [project] = await tx
    .select({ dealId: projects.dealId })
    .from(projects)
    .where(eq(projects.id, retainer.projectId));
  const contract = await signedContractFor(tx, {
    clientId: retainer.clientId,
    dealId: project?.dealId ?? null,
  });
  if (!contract) return NONE;
  const now = nowOf(deps);
  const base = {
    organizationId: retainer.organizationId,
    clientId: retainer.clientId,
    dealId: contract.dealId,
    contractId: contract.contractId,
  };

  let months = 0;
  const month = lisbonMonth(now);
  // A retainer without a fee has nothing to bill; a request needs a positive amount.
  const billsMonths = retainer.status === 'active' && Number(retainer.monthlyFee) > 0;
  if (scope === 'all' && billsMonths && month >= retainer.startsOn) {
    const [billed] = await tx
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(
        and(eq(paymentRequests.retainerId, retainer.id), eq(paymentRequests.retainerMonth, month)),
      );
    if (!billed) {
      await issuePaymentRequest(
        tx,
        {
          ...base,
          label: retainerMonthLabel(contract.locale, retainer.tier, month),
          amount: retainer.monthlyFee,
          currency: retainer.currency,
          origin: { kind: 'retainer_month', retainerId: retainer.id, month },
        },
        deps.billing,
        now,
      );
      months = 1;
    }
  }

  const unbilled = await tx
    .select({
      id: retainerExtraRequests.id,
      description: retainerExtraRequests.description,
      quoteAmount: retainerExtraRequests.quoteAmount,
      currency: retainerExtraRequests.currency,
    })
    .from(retainerExtraRequests)
    .where(
      and(
        eq(retainerExtraRequests.retainerId, retainer.id),
        eq(retainerExtraRequests.status, 'approved'),
        sql`not exists (select 1 from public.payment_requests r
                        where r.retainer_extra_request_id = ${retainerExtraRequests.id})`,
      ),
    )
    .orderBy(retainerExtraRequests.createdAt);
  let extras = 0;
  for (const extra of unbilled) {
    if (!extra.quoteAmount || !extra.currency) continue;
    await issuePaymentRequest(
      tx,
      {
        ...base,
        label: retainerExtraLabel(contract.locale, extra.description),
        amount: extra.quoteAmount,
        currency: extra.currency,
        origin: { kind: 'retainer_extra', retainerId: retainer.id, extraRequestId: extra.id },
      },
      deps.billing,
      now,
    );
    extras += 1;
  }
  return { months, extras };
}

/**
 * The daily billing sweep (`retainers-billing`): every active retainer that has started and every
 * retainer with an approved extra request still to bill, one transaction each.
 */
export async function sweepRetainerBilling(deps: RetainersDeps): Promise<number> {
  const month = lisbonMonth(nowOf(deps));
  const due = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ id: string }>(sql`
      select r.id from public.retainers r
      where (r.status = 'active' and r.monthly_fee > 0 and r.starts_on <= ${month}::date)
         or exists (
           select 1 from public.retainer_extra_requests e
           where e.retainer_id = r.id and e.status = 'approved'
             and not exists (select 1 from public.payment_requests p
                             where p.retainer_extra_request_id = e.id)
         )
      order by r.created_at
    `),
  );
  let issued = 0;
  // One retainer that cannot be billed must not hold back the others; its failure is logged and
  // the next sweep tries it again.
  for (const { id } of due) {
    try {
      const result = await deps.contexts.withSystemContext((tx) =>
        issueRetainerRequests(tx, id, deps),
      );
      issued += result.months + result.extras;
    } catch (error) {
      logger.error('retainers.billing_failed', {
        retainerId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (issued > 0) await (deps.flush ?? requestFlush)();
  return issued;
}
