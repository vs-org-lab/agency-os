import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { organizationMemberships, projects, tasks } = schema;

/** RF-161: the celebration box sent at delivery. */
export const CELEBRATION_TASK = 'Enviar caixa de celebração';

/** AUT-21: the proposal of what comes after the project, prepared by the founder. */
export const ACTIVATION_TASK = 'Preparar proposta de ativação';

const CELEBRATION_NOTES =
  'Caixa de celebração da entrega: monumento, carta, espumante ou alternativa sem álcool e manual impresso quando houver marca.';

const CELEBRATION_DAYS = 7;
const ACTIVATION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

export type DeliveryDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  /** Moves the deal as the system; resolves whether the move was allowed. */
  moveDeal: (tx: DbTransaction, dealId: string, code: string) => Promise<boolean>;
  now?: () => Date;
};

async function founderOf(tx: DbTransaction, organizationId: string): Promise<string | null> {
  const [founder] = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, 'founder'),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .orderBy(organizationMemberships.createdAt)
    .limit(1);
  return founder?.userId ?? null;
}

/**
 * What follows a delivered project (AUT-21, RF-161): the celebration box and activation proposal
 * tasks for the founder, created once per project, and the deal's move from 2.9 to 2.10, which the
 * pipeline allows only once every milestone is requested (RN-04).
 */
export async function completeDelivery(
  projectId: string,
  deps: DeliveryDeps,
): Promise<{ moved: boolean; tasks: number }> {
  if (!z.uuid().safeParse(projectId).success) return { moved: false, tasks: 0 };
  const now = (deps.now ?? (() => new Date()))();
  return deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('update');
    if (project?.status !== 'delivered') return { moved: false, tasks: 0 };

    const existing = await tx
      .select({ title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, project.id),
          inArray(tasks.title, [CELEBRATION_TASK, ACTIVATION_TASK]),
        ),
      );
    const due = (days: number) => LISBON_DATE.format(new Date(now.getTime() + days * DAY_MS));
    const founderId = await founderOf(tx, project.organizationId);
    const drafts = [
      { title: CELEBRATION_TASK, notes: CELEBRATION_NOTES, dueOn: due(CELEBRATION_DAYS) },
      { title: ACTIVATION_TASK, notes: '', dueOn: due(ACTIVATION_DAYS) },
    ].filter((draft) => !existing.some((task) => task.title === draft.title));
    if (drafts.length > 0) {
      await tx.insert(tasks).values(
        drafts.map((draft) => ({
          ...draft,
          organizationId: project.organizationId,
          clientId: project.clientId,
          projectId: project.id,
          assigneeId: founderId,
        })),
      );
    }
    const moved = project.dealId ? await deps.moveDeal(tx, project.dealId, '2.10') : false;
    return { moved, tasks: drafts.length };
  });
}
