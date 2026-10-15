import { sql } from 'drizzle-orm';
import type { DbTransaction } from '@agency-os/db';
import { allowance, limitState } from './domain/allowance';
import type { RetainerLimitKind } from './domain/kinds';
import { previousMonth } from './domain/months';

export type LimitMonth = {
  kind: RetainerLimitKind;
  limit: number;
  carry: number;
  available: number;
  used: number;
  remaining: number;
  percent: number;
};

/**
 * Each limit of a retainer in a month: the allowance from the previous month's usage (RN-60) and
 * this month's usage. Work paid by an extra request counts against neither.
 */
export async function limitMonths(
  tx: DbTransaction,
  retainer: { id: string; startsOn: string },
  month: string,
): Promise<LimitMonth[]> {
  const previous = previousMonth(month);
  const rows = await tx.execute<{
    kind: RetainerLimitKind;
    monthly_limit: string;
    used: string;
    used_last_month: string;
  }>(sql`
    select l.kind::text, l.monthly_limit::text,
           coalesce(sum(u.quantity) filter (where u.month = ${month}::date), 0)::text as used,
           coalesce(sum(u.quantity) filter (where u.month = ${previous}::date), 0)::text
             as used_last_month
    from public.retainer_limits l
    left join public.retainer_usage u
      on u.retainer_id = l.retainer_id and u.kind = l.kind and u.extra_request_id is null
    where l.retainer_id = ${retainer.id}::uuid
    group by l.kind, l.monthly_limit
    order by l.kind
  `);
  const firstMonth = month <= retainer.startsOn;
  return rows.map((row) => {
    const limit = Number(row.monthly_limit);
    const { carry } = allowance({
      limit,
      usedLastMonth: Number(row.used_last_month),
      firstMonth,
    });
    return {
      kind: row.kind,
      limit,
      carry,
      ...limitState({ limit, carry, used: Number(row.used) }),
    };
  });
}
