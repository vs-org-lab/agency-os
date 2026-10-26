import { and, asc, eq, gte, inArray, lt, lte, max, ne, or, isNull, sql, count } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import type { Currency } from '@agency-os/i18n';
import { withActor, type Actor } from '@/modules/access';
import { canReadBilling } from '@/modules/billing';
import { canSeePipeline } from '@/modules/commercial';
import { toMinorUnits } from '@/modules/contracts';
import { listTodayItems } from '@/modules/commercial/server';
import { sortByUrgency } from '@/modules/tasks';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { isStudioStaff } from './access';

const {
  approvals,
  clientHealthSnapshots,
  clients,
  commercialSettings,
  paymentRequests,
  projectPhases,
  projectSteps,
  projectUpdates,
  projects,
  retainers,
  tasks,
} = schema;

export type HomeItemKind =
  'follow_up' | 'queue_b' | 'call' | 'task' | 'step' | 'approval' | 'payment';

export type HomeItem = {
  kind: HomeItemKind;
  id: string;
  title: string;
  clientName: string;
  href: string;
  dueAt: Date;
  overdue: boolean;
  /** Follow-up sequence day, present on commercial follow-ups only. */
  sequenceDay: number | null;
};

export type HomeClient = {
  id: string;
  name: string;
  progress: { done: number; total: number } | null;
  lastActivityAt: Date | null;
  /** The client has an active retainer (S-01 label). */
  retainer: boolean;
  /** The latest health level, for those who see the health (RLS of the snapshots). */
  healthLevel: 'healthy' | 'attention' | 'at_risk' | null;
};

export type HomeView = {
  indicators: {
    clients: number;
    activeProjects: number;
    waiting: number;
    /** Open payment requests by currency; null for whoever does not read billing. */
    receivable: Array<{ currency: Currency; amountMinor: bigint }> | null;
  };
  today: HomeItem[];
  clients: HomeClient[];
  /** Whether the reader may open the commercial pipeline. */
  pipeline: boolean;
};

/** How long a change request stays in "Hoje" after the client sends it. */
const CHANGE_REQUEST_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIME_ZONE = 'Europe/Lisbon';

function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

async function commercialItems(
  tx: DbTransaction,
  actor: Actor,
  now: Date,
  timeZone: string,
): Promise<HomeItem[]> {
  if (!canSeePipeline(actor)) return [];
  const items = await listTodayItems(tx, { now, timeZone, organizationId: actor.organizationId });
  return items.map((item) => ({
    kind: item.kind,
    id: item.id,
    title: '',
    clientName: item.clientName,
    href: item.kind === 'queue_b' ? '/applications?tab=queue_b' : `/pipeline/${item.dealId}`,
    dueAt: item.dueAt,
    overdue: item.overdue,
    sequenceDay: item.sequenceDay,
  }));
}

async function roomItems(
  tx: DbTransaction,
  actor: Actor,
  now: Date,
  today: string,
): Promise<HomeItem[]> {
  const myTasks = await tx
    .select({
      id: tasks.id,
      title: tasks.title,
      dueOn: tasks.dueOn,
      clientId: tasks.clientId,
      clientName: clients.name,
    })
    .from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId))
    .where(
      and(
        eq(tasks.organizationId, actor.organizationId),
        eq(tasks.status, 'open'),
        lte(tasks.dueOn, today),
        or(eq(tasks.assigneeId, actor.userId), isNull(tasks.assigneeId)),
      ),
    );
  const lateSteps = await tx
    .select({
      id: projectSteps.id,
      name: projectSteps.name,
      dueOn: projectSteps.dueOn,
      clientId: projectSteps.clientId,
      clientName: clients.name,
    })
    .from(projectSteps)
    .innerJoin(projects, eq(projects.id, projectSteps.projectId))
    .innerJoin(clients, eq(clients.id, projectSteps.clientId))
    .where(
      and(
        eq(projectSteps.organizationId, actor.organizationId),
        eq(projects.organizationId, actor.organizationId),
        ne(projectSteps.status, 'done'),
        lt(projectSteps.dueOn, today),
        eq(projects.status, 'active'),
      ),
    );
  const changes = await tx
    .select({
      id: approvals.id,
      decidedAt: approvals.decidedAt,
      clientId: approvals.clientId,
      clientName: clients.name,
      phaseName: projectPhases.name,
    })
    .from(approvals)
    .innerJoin(clients, eq(clients.id, approvals.clientId))
    .innerJoin(projectPhases, eq(projectPhases.id, approvals.subjectId))
    .where(
      and(
        eq(approvals.organizationId, actor.organizationId),
        eq(projectPhases.organizationId, actor.organizationId),
        eq(approvals.status, 'changes_requested'),
        gte(approvals.decidedAt, new Date(now.getTime() - CHANGE_REQUEST_DAYS * DAY_MS)),
        eq(projectPhases.status, 'in_progress'),
      ),
    );

  return [
    ...myTasks.map((task) => ({
      kind: 'task' as const,
      id: task.id,
      title: task.title,
      clientName: task.clientName ?? '',
      href: task.clientId ? `/c/${task.clientId}/tasks` : '/tasks',
      dueAt: dayStart(task.dueOn ?? today),
      overdue: (task.dueOn ?? today) < today,
      sequenceDay: null,
    })),
    ...lateSteps.map((step) => ({
      kind: 'step' as const,
      id: step.id,
      title: step.name,
      clientName: step.clientName,
      href: `/c/${step.clientId}`,
      dueAt: dayStart(step.dueOn ?? today),
      overdue: true,
      sequenceDay: null,
    })),
    ...changes.map((change) => ({
      kind: 'approval' as const,
      id: change.id,
      title: change.phaseName,
      clientName: change.clientName,
      href: `/c/${change.clientId}`,
      dueAt: change.decidedAt ?? now,
      overdue: true,
      sequenceDay: null,
    })),
  ];
}

async function billingFigures(
  tx: DbTransaction,
  actor: Actor,
  today: string,
): Promise<{ items: HomeItem[]; receivable: HomeView['indicators']['receivable'] }> {
  if (!canReadBilling(actor)) return { items: [], receivable: null };
  const overdue = await tx
    .select({
      id: paymentRequests.id,
      number: paymentRequests.number,
      dueDate: paymentRequests.dueDate,
      dealId: paymentRequests.dealId,
      clientId: paymentRequests.clientId,
      retainerId: paymentRequests.retainerId,
      clientName: clients.name,
    })
    .from(paymentRequests)
    .innerJoin(clients, eq(clients.id, paymentRequests.clientId))
    .where(
      and(
        eq(paymentRequests.organizationId, actor.organizationId),
        eq(paymentRequests.status, 'sent'),
        lt(paymentRequests.dueDate, today),
      ),
    );
  const receivable = await tx
    .select({
      currency: paymentRequests.currency,
      amount: sql<string>`sum(${paymentRequests.amount})::text`,
    })
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.organizationId, actor.organizationId),
        eq(paymentRequests.status, 'sent'),
      ),
    )
    .groupBy(paymentRequests.currency)
    .orderBy(asc(paymentRequests.currency));
  return {
    items: overdue.map((request) => ({
      kind: 'payment' as const,
      id: request.id,
      title: request.number,
      clientName: request.clientName,
      // Retainer requests are worked on in the retainer room, not on the deal.
      href: request.retainerId ? `/c/${request.clientId}/retainer` : `/pipeline/${request.dealId}`,
      dueAt: dayStart(request.dueDate),
      overdue: true,
      sequenceDay: null,
    })),
    receivable: receivable.map((row) => ({
      currency: row.currency,
      amountMinor: toMinorUnits(row.amount),
    })),
  };
}

async function clientProgress(tx: DbTransaction, organizationId: string): Promise<HomeClient[]> {
  const active = await tx
    .select({
      projectId: projects.id,
      clientId: projects.clientId,
      clientName: clients.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.organizationId, organizationId), eq(projects.status, 'active')))
    .orderBy(asc(clients.name), asc(projects.createdAt));
  if (active.length === 0) return [];
  const projectIds = active.map((row) => row.projectId);
  const phases = await tx
    .select({ projectId: projectPhases.projectId, status: projectPhases.status })
    .from(projectPhases)
    .where(
      and(
        eq(projectPhases.organizationId, organizationId),
        inArray(projectPhases.projectId, projectIds),
      ),
    );
  const activity = await tx
    .select({ projectId: projectUpdates.projectId, at: max(projectUpdates.createdAt) })
    .from(projectUpdates)
    .where(
      and(
        eq(projectUpdates.organizationId, organizationId),
        inArray(projectUpdates.projectId, projectIds),
      ),
    )
    .groupBy(projectUpdates.projectId);

  const byClient = new Map<string, HomeClient>();
  for (const row of active) {
    if (byClient.has(row.clientId)) continue;
    const own = phases.filter((phase) => phase.projectId === row.projectId);
    const last = activity.find((entry) => entry.projectId === row.projectId)?.at ?? null;
    byClient.set(row.clientId, {
      id: row.clientId,
      name: row.clientName,
      progress: own.length
        ? { done: own.filter((phase) => phase.status === 'done').length, total: own.length }
        : null,
      lastActivityAt: last ? new Date(last) : null,
      retainer: false,
      healthLevel: null,
    });
  }
  const clientIds = [...byClient.keys()];
  const withRetainer = await tx
    .select({ clientId: retainers.clientId })
    .from(retainers)
    .where(
      and(
        eq(retainers.organizationId, organizationId),
        inArray(retainers.clientId, clientIds),
        eq(retainers.status, 'active'),
      ),
    );
  const latest = await tx
    .selectDistinctOn([clientHealthSnapshots.clientId], {
      clientId: clientHealthSnapshots.clientId,
      level: clientHealthSnapshots.level,
    })
    .from(clientHealthSnapshots)
    .where(
      and(
        eq(clientHealthSnapshots.organizationId, organizationId),
        inArray(clientHealthSnapshots.clientId, clientIds),
      ),
    )
    .orderBy(clientHealthSnapshots.clientId, sql`${clientHealthSnapshots.day} desc`);
  for (const row of withRetainer) {
    const client = byClient.get(row.clientId);
    if (client) client.retainer = true;
  }
  for (const row of latest) {
    const client = byClient.get(row.clientId);
    if (client) client.healthLevel = row.level;
  }
  return [...byClient.values()];
}

/**
 * S-01: indicators, "Hoje" (US-11) ordered by urgency and the clients with their
 * progress, all read under the caller's row level security.
 */
export async function loadHome(
  claims: VerifiedClaims,
  now: Date,
  deps: { contexts: Pick<DbContexts, 'withUserContext'> },
): Promise<HomeView | null> {
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isStudioStaff(actor)) return null;
      const [settings] = await tx
        .select({ timeZone: commercialSettings.timeZone })
        .from(commercialSettings)
        .where(eq(commercialSettings.organizationId, actor.organizationId));
      const timeZone = settings?.timeZone ?? DEFAULT_TIME_ZONE;
      const today = localDate(now, timeZone);

      const [commercial, rooms, billing, clientsView, activeCount] = await Promise.all([
        commercialItems(tx, actor, now, timeZone),
        roomItems(tx, actor, now, today),
        billingFigures(tx, actor, today),
        clientProgress(tx, actor.organizationId),
        tx
          .select({
            total: count(),
            clients: sql<number>`count(distinct ${projects.clientId})::int`,
          })
          .from(projects)
          .where(
            and(eq(projects.organizationId, actor.organizationId), eq(projects.status, 'active')),
          ),
      ]);

      const todayItems = sortByUrgency([...commercial, ...rooms, ...billing.items]);
      return {
        indicators: {
          clients: activeCount[0]?.clients ?? 0,
          activeProjects: activeCount[0]?.total ?? 0,
          waiting: todayItems.length,
          receivable: billing.receivable,
        },
        today: todayItems,
        clients: clientsView,
        pipeline: canSeePipeline(actor),
      };
    },
    null,
  );
}
