import { sql } from 'drizzle-orm';
import { emit, requestFlush } from '@/modules/events';
import { logger } from '@/platform/logger';
import { lisbonDay, type HealthDeps } from './access';
import { computeClientHealth } from './health';

/**
 * Every morning (spec 3E.1 §3.5): each active client's health is kept for the day, replacing an
 * earlier run of the same day. Entering "at risk" from any other level (or from no record) emits
 * `health.client.at_risk` once; one transaction per client, so one failure does not stop the rest.
 */
export async function sweepHealthSnapshots(
  now: Date,
  deps: HealthDeps,
): Promise<{ saved: number; alerts: number }> {
  const today = lisbonDay(now);
  const clients = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ id: string; organization_id: string }>(sql`
      select id, organization_id from public.clients
      where lifecycle = 'active' and archived_at is null
      order by created_at
    `),
  );
  let saved = 0;
  let alerts = 0;
  for (const client of clients) {
    try {
      const alerted = await deps.contexts.withSystemContext(async (tx) => {
        const health = await computeClientHealth(tx, client.id, now);
        const [before] = await tx.execute<{ day: string; level: string | null }>(sql`
          select day::text, level::text from public.client_health_snapshots
          where client_id = ${client.id}::uuid and day <= ${today}::date
          order by day desc
          limit 1
          for update
        `);
        await tx.execute(sql`
          insert into public.client_health_snapshots (organization_id, client_id, day, score,
                                                      level)
          values (${client.organization_id}::uuid, ${client.id}::uuid, ${today}::date,
                  ${health.score}, ${health.level}::app.health_level)
          on conflict (client_id, day)
          do update set score = excluded.score, level = excluded.level, created_at = now()
        `);
        // The previous level is today's earlier run, if any, otherwise the latest earlier day.
        const enteredRisk = health.level === 'at_risk' && before?.level !== 'at_risk';
        if (enteredRisk && health.score !== null) {
          await emit(tx, {
            type: 'health.client.at_risk',
            organizationId: client.organization_id,
            clientId: client.id,
            payload: { score: health.score },
          });
        }
        return enteredRisk;
      });
      saved += 1;
      if (alerted) alerts += 1;
    } catch (error) {
      logger.error('health.snapshot_failed', {
        clientId: client.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (alerts > 0) await (deps.flush ?? requestFlush)();
  return { saved, alerts };
}
