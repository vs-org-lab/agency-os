import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_INPUT,
  INVALID_STATE,
  lisbonDay,
  NOT_FOUND,
  nowOf,
  outcomeWriter,
  type NotFound,
  type OutcomesDeps,
} from './access';

const { outcomeConditions, projectOutcomes, projects } = schema;

/** RN-71: the client conditions every outcome starts with. */
export const DEFAULT_CONDITIONS = [
  { kind: 'access', description: 'Acessos entregues em 5 dias úteis' },
  { kind: 'approvals', description: 'Aprovações dentro do prazo' },
  { kind: 'media_budget', description: 'Orçamento de media acordado' },
] as const;

const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});

/** A metric value with at most two decimals, as outcomes keep them. */
export const metricValue = z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/);

const outcomeSchema = z
  .object({
    clientId: z.uuid(),
    projectId: z.uuid(),
    metric: z.string().trim().min(1).max(80),
    unit: z.string().trim().max(20),
    baseline: metricValue,
    target: metricValue,
    deadline: isoDate,
    dataSource: z.string().trim().min(1).max(120),
  })
  .refine((data) => Number(data.baseline) !== Number(data.target));

/** What the outcome form sends; every field is checked against the schema before use. */
export type OutcomeInput = {
  clientId: string;
  projectId: string;
  metric: string;
  unit: string;
  baseline: string;
  target: string;
  deadline: string;
  dataSource: string;
};

/**
 * Creates or edits the agreed outcome of a project (RF-120) with the three client conditions on
 * creation. A new or changed deadline lies ahead. Once the guarantee is decided, the agreed
 * metric, baseline, target and deadline are final; the unit and the data source may still change.
 */
export async function saveOutcome(
  claims: VerifiedClaims,
  input: OutcomeInput,
  deps: OutcomesDeps,
): Promise<{ ok: true; id: string } | NotFound | typeof INVALID_INPUT | typeof INVALID_STATE> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) {
    return z.uuid().safeParse(input.clientId).success ? INVALID_INPUT : NOT_FOUND;
  }
  const data = parsed.data;
  const actor = await outcomeWriter(claims, data.clientId, deps);
  if (!actor) return NOT_FOUND;
  const now = nowOf(deps);
  const today = lisbonDay(now);

  return deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, data.projectId),
          eq(projects.clientId, data.clientId),
          eq(projects.organizationId, actor.organizationId),
        ),
      );
    if (!project) return INVALID_INPUT;
    const [current] = await tx
      .select()
      .from(projectOutcomes)
      .where(eq(projectOutcomes.projectId, project.id))
      .for('update');
    const fields = {
      metric: data.metric,
      unit: data.unit,
      baseline: data.baseline,
      target: data.target,
      deadline: data.deadline,
      dataSource: data.dataSource,
      updatedAt: now,
    };

    let outcomeId: string;
    if (current) {
      const agreedChanged =
        current.metric !== data.metric ||
        Number(current.baseline) !== Number(data.baseline) ||
        Number(current.target) !== Number(data.target) ||
        current.deadline !== data.deadline;
      if (current.guaranteeStatus !== 'pending' && agreedChanged) return INVALID_STATE;
      if (current.deadline !== data.deadline && data.deadline <= today) return INVALID_INPUT;
      await tx.update(projectOutcomes).set(fields).where(eq(projectOutcomes.id, current.id));
      outcomeId = current.id;
    } else {
      if (data.deadline <= today) return INVALID_INPUT;
      const [created] = await tx
        .insert(projectOutcomes)
        .values({
          ...fields,
          organizationId: actor.organizationId,
          clientId: data.clientId,
          projectId: project.id,
          createdBy: actor.userId,
          createdAt: now,
        })
        .returning({ id: projectOutcomes.id });
      if (!created) throw new Error('The outcome was not created');
      outcomeId = created.id;
      await tx.insert(outcomeConditions).values(
        DEFAULT_CONDITIONS.map((condition) => ({
          organizationId: actor.organizationId,
          clientId: data.clientId,
          outcomeId,
          kind: condition.kind,
          description: condition.description,
        })),
      );
    }
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'outcome.saved',
      resourceType: 'project_outcome',
      resourceId: outcomeId,
      clientId: data.clientId,
      metadata: { created: !current },
    });
    return { ok: true as const, id: outcomeId };
  });
}
