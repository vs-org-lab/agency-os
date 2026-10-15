import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { requestFlush } from '@/modules/events';
import { soleClientManager } from '@/modules/rooms/server';
import { logger } from '@/platform/logger';
import type { OutcomesDeps } from './access';
import { decideGuarantee, lockOutcome } from './guarantee';

const { clients, outcomeConditions, projectOutcomes, tasks } = schema;

/** Days the team has to decide the client conditions once the deadline has passed. */
const CONDITIONS_TASK_DAYS = 3;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A deadline passed with client conditions still undecided: the client's manager (or nobody, for
 * the founder to pick up) gets one task per deadline to decide them (spec 3C §2.5).
 */
async function askForConditions(tx: DbTransaction, outcomeId: string, today: string) {
  const outcome = await lockOutcome(tx, outcomeId);
  if (
    !outcome ||
    outcome.guaranteeStatus !== 'pending' ||
    outcome.deadline >= today ||
    outcome.conditionsTaskFor === outcome.deadline
  ) {
    return false;
  }
  const [pending] = await tx
    .select({ id: outcomeConditions.id })
    .from(outcomeConditions)
    .where(
      and(eq(outcomeConditions.outcomeId, outcome.id), eq(outcomeConditions.status, 'pending')),
    )
    .limit(1);
  if (!pending) return false;
  const [client] = await tx
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, outcome.clientId));
  await tx.insert(tasks).values({
    organizationId: outcome.organizationId,
    clientId: outcome.clientId,
    projectId: outcome.projectId,
    title: `Decidir as condições do resultado de ${client?.name ?? ''}`.slice(0, 200),
    notes: `O prazo de "${outcome.metric}" terminou a ${outcome.deadline}: registar se cada condição do cliente foi cumprida para decidir a garantia.`,
    assigneeId: await soleClientManager(tx, outcome.clientId),
    dueOn: addDays(today, CONDITIONS_TASK_DAYS),
  });
  await tx
    .update(projectOutcomes)
    .set({ conditionsTaskFor: outcome.deadline })
    .where(eq(projectOutcomes.id, outcome.id));
  await recordAudit(tx, {
    organizationId: outcome.organizationId,
    action: 'outcome.conditions_due',
    resourceType: 'project_outcome',
    resourceId: outcome.id,
    clientId: outcome.clientId,
    metadata: { deadline: outcome.deadline },
  });
  return true;
}

/**
 * AUT-26, every morning: outcomes past their deadline get their guarantee decided, or a task to
 * decide the client conditions; active guarantees count their months and close at 3. One
 * transaction per outcome, so one failure does not hold back the others.
 */
export async function sweepOutcomes(
  today: string,
  deps: OutcomesDeps,
): Promise<{ decided: number; tasks: number }> {
  const due = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ id: string }>(sql`
      select id from public.project_outcomes
      where (guarantee_status = 'pending' and deadline < ${today}::date)
         or guarantee_status = 'active'
      order by deadline
    `),
  );
  let decided = 0;
  let asked = 0;
  for (const { id } of due) {
    try {
      await deps.contexts.withSystemContext(async (tx) => {
        if (await decideGuarantee(tx, id, today)) decided += 1;
        else if (await askForConditions(tx, id, today)) asked += 1;
      });
    } catch (error) {
      logger.error('outcomes.sweep_failed', {
        outcomeId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (decided > 0) await (deps.flush ?? requestFlush)();
  return { decided, tasks: asked };
}
