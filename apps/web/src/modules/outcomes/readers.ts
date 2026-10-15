import { sql } from 'drizzle-orm';
import type { VerifiedClaims } from '@/platform/db';
import { outcomeReader, outcomeWriter, type OutcomesDeps } from './access';

export type GuaranteeView = {
  status: 'pending' | 'not_activated' | 'active' | 'closed';
  reason: 'target_met' | 'conditions_failed' | 'months_used' | null;
  activatedOn: string | null;
  monthsUsed: number;
};

export type OutcomeView = {
  id: string;
  projectId: string;
  metric: string;
  unit: string;
  baseline: number;
  target: number;
  deadline: string;
  dataSource: string;
  guarantee: GuaranteeView;
};

export type ConditionView = {
  id: string;
  kind: 'access' | 'approvals' | 'media_budget' | 'other';
  description: string;
  status: 'pending' | 'met' | 'failed';
  recordedOn: string | null;
};

export type MeasurementView = { measuredOn: string; value: number };

export type StaffOutcomeView = {
  canWrite: boolean;
  projects: { id: string; name: string }[];
  /** The guarantee text of the accepted proposal, as a reference while the map is not approved. */
  proposalGuarantee: string | null;
  outcome: OutcomeView | null;
  conditions: (ConditionView & { note: string | null })[];
  measurements: (MeasurementView & { note: string | null })[];
};

export type OutcomeRow = {
  id: string;
  project_id: string;
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  deadline: string;
  data_source: string;
  guarantee_status: GuaranteeView['status'];
  guarantee_reason: GuaranteeView['reason'];
  activated_on: string | null;
  months_used: number;
};

/** The columns every outcome view reads, from the table or from the portal view. */
export const OUTCOME_COLUMNS = sql.raw(`id, project_id, metric, unit, baseline::text,
  target::text, deadline::text, data_source, guarantee_status::text, guarantee_reason::text,
  activated_on::text, months_used`);

export function outcomeView(row: OutcomeRow): OutcomeView {
  return {
    id: row.id,
    projectId: row.project_id,
    metric: row.metric,
    unit: row.unit,
    baseline: Number(row.baseline),
    target: Number(row.target),
    deadline: row.deadline,
    dataSource: row.data_source,
    guarantee: {
      status: row.guarantee_status,
      reason: row.guarantee_reason,
      activatedOn: row.activated_on,
      monthsUsed: row.months_used,
    },
  };
}

/**
 * C-11: the client's agreed outcome with its values, conditions and guarantee, for the room's
 * readers; the room's writers edit it.
 */
export async function loadStaffOutcome(
  claims: VerifiedClaims,
  clientId: string,
  deps: OutcomesDeps,
): Promise<StaffOutcomeView | null> {
  const reader = await outcomeReader(claims, clientId, deps);
  if (!reader) return null;
  const writer = await outcomeWriter(claims, clientId, deps);

  return deps.contexts.withSystemContext(async (tx) => {
    const projects = await tx.execute<{ id: string; name: string }>(sql`
      select id, name from public.projects
      where client_id = ${clientId}::uuid and organization_id = ${reader.organizationId}::uuid
      order by created_at
    `);
    const [row] = await tx.execute<OutcomeRow>(sql`
      select ${OUTCOME_COLUMNS} from public.project_outcomes
      where client_id = ${clientId}::uuid and organization_id = ${reader.organizationId}::uuid
      order by created_at desc
      limit 1
    `);
    const projectId = row?.project_id ?? projects[0]?.id ?? null;
    const [proposal] = projectId
      ? await tx.execute<{ guarantee: string }>(sql`
          select p.guarantee from public.proposals p
          join public.projects pr on pr.deal_id = p.deal_id
          where pr.id = ${projectId}::uuid and p.status = 'accepted'
          order by p.accepted_at desc nulls last
          limit 1
        `)
      : [];
    const base = {
      canWrite: writer !== null,
      projects: [...projects],
      proposalGuarantee: proposal?.guarantee || null,
    };
    if (!row) return { ...base, outcome: null, conditions: [], measurements: [] };

    const conditions = await tx.execute<{
      id: string;
      kind: ConditionView['kind'];
      description: string;
      status: ConditionView['status'];
      recorded_on: string | null;
      note: string | null;
    }>(sql`
      select id, kind::text, description, status::text, recorded_on::text, note
      from public.outcome_conditions where outcome_id = ${row.id}::uuid
      order by created_at, kind
    `);
    const measurements = await tx.execute<{
      measured_on: string;
      value: string;
      note: string | null;
    }>(
      sql`
        select measured_on::text, value::text, note from public.outcome_measurements
        where outcome_id = ${row.id}::uuid order by measured_on
      `,
    );
    return {
      ...base,
      outcome: outcomeView(row),
      conditions: conditions.map((condition) => ({
        id: condition.id,
        kind: condition.kind,
        description: condition.description,
        status: condition.status,
        recordedOn: condition.recorded_on,
        note: condition.note,
      })),
      measurements: measurements.map((measurement) => ({
        measuredOn: measurement.measured_on,
        value: Number(measurement.value),
        note: measurement.note,
      })),
    };
  });
}
