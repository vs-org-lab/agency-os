import { sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { RetainersDeps } from './access';
import { ALERT_THRESHOLDS, type AlertThreshold } from './domain/allowance';
import type { RetainerLimitKind } from './domain/kinds';
import { limitMonths } from './month';

const { retainerAlerts } = schema;

export type PendingAlert = { kind: RetainerLimitKind; threshold: AlertThreshold; percent: number };

/**
 * AUT-22: the thresholds the month's usage has reached and not yet alerted, recorded as alerted in
 * the same step, so each kind, month and threshold is announced once.
 */
export async function pendingAlerts(
  retainerId: string,
  month: string,
  deps: Pick<RetainersDeps, 'contexts'>,
): Promise<PendingAlert[]> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [retainer] = await tx.execute<{
      id: string;
      organization_id: string;
      client_id: string;
      starts_on: string;
    }>(sql`
      select id, organization_id, client_id, starts_on::text from public.retainers
      where id = ${retainerId}::uuid
      for update
    `);
    if (!retainer) return [];
    const limits = await limitMonths(tx, { id: retainer.id, startsOn: retainer.starts_on }, month);
    const reached = limits.flatMap((limit) =>
      ALERT_THRESHOLDS.filter((threshold) => limit.percent >= threshold).map((threshold) => ({
        kind: limit.kind,
        threshold,
        percent: limit.percent,
      })),
    );
    const pending: PendingAlert[] = [];
    for (const alert of reached) {
      const inserted = await tx
        .insert(retainerAlerts)
        .values({
          retainerId: retainer.id,
          organizationId: retainer.organization_id,
          clientId: retainer.client_id,
          kind: alert.kind,
          month,
          threshold: alert.threshold,
        })
        .onConflictDoNothing()
        .returning({ threshold: retainerAlerts.threshold });
      if (inserted.length > 0) pending.push(alert);
    }
    return pending;
  });
}
