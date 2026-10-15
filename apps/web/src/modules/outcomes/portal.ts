import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { VerifiedClaims } from '@/platform/db';
import type { OutcomesDeps } from './access';
import {
  OUTCOME_COLUMNS,
  outcomeView,
  type ConditionView,
  type MeasurementView,
  type OutcomeRow,
  type OutcomeView,
} from './readers';

/** P-10: the client's agreed outcome, its values, conditions and guarantee, without notes. */
export type PortalOutcomeView = {
  outcome: OutcomeView;
  conditions: ConditionView[];
  measurements: MeasurementView[];
};

/** The outcome as the client's decision maker and operational users see it, through the views. */
export async function loadPortalOutcome(
  claims: VerifiedClaims,
  clientId: string,
  deps: OutcomesDeps,
): Promise<PortalOutcomeView | null> {
  if (claims.user_kind !== 'client' || !z.uuid().safeParse(clientId).success) return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [row] = await tx.execute<OutcomeRow>(sql`
      select ${OUTCOME_COLUMNS} from public.portal_project_outcomes
      where client_id = ${clientId}::uuid
      order by deadline desc
      limit 1
    `);
    if (!row) return null;
    const conditions = await tx.execute<{
      id: string;
      kind: ConditionView['kind'];
      description: string;
      status: ConditionView['status'];
      recorded_on: string | null;
    }>(sql`
      select id, kind::text, description, status::text, recorded_on::text
      from public.portal_outcome_conditions where outcome_id = ${row.id}::uuid
      order by kind, description
    `);
    const measurements = await tx.execute<{ measured_on: string; value: string }>(sql`
      select measured_on::text, value::text from public.portal_outcome_measurements
      where outcome_id = ${row.id}::uuid order by measured_on
    `);
    return {
      outcome: outcomeView(row),
      conditions: conditions.map((condition) => ({
        id: condition.id,
        kind: condition.kind,
        description: condition.description,
        status: condition.status,
        recordedOn: condition.recorded_on,
      })),
      measurements: measurements.map((measurement) => ({
        measuredOn: measurement.measured_on,
        value: Number(measurement.value),
      })),
    };
  });
}
