import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type TaskStatus } from '@agency-os/db';
import { withActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { emit } from '@/modules/events';
import { isRoomStaff, roomActor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { clientStaffAssignments, organizationMemberships, projects, taskItems, tasks } = schema;

export type TasksDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** AUT-13: the tasks the first payment opens, days after the project starts. */
const KICKOFF_TASKS = [
  { source: 'kickoff', title: 'Agendar kickoff', days: 2 },
  { source: 'welcome_kit', title: 'Enviar kit de boas-vindas', days: 7 },
] as const;

export type TaskItemView = { id: string; position: number; title: string; done: boolean };

export type TaskView = {
  id: string;
  title: string;
  notes: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueOn: string | null;
  status: TaskStatus;
  items: TaskItemView[];
  itemsDone: number;
  itemsTotal: number;
  commentCount: number;
  fileCount: number;
  /** Whether the reader may edit or delete the task, beyond completing it. */
  canEdit: boolean;
};

const title = z.string().trim().min(1).max(200);

const taskSchema = z.object({
  title,
  notes: z.string().trim().max(5000).optional(),
  clientId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
  dueOn: z.iso.date().nullable().optional(),
  items: z.array(title).max(30).optional(),
});

export type TaskInput = z.input<typeof taskSchema>;

function lisbonDay(now: Date, plusDays = 0): string {
  return LISBON_DATE.format(new Date(now.getTime() + plusDays * DAY_MS));
}

/** Founders create anywhere; project managers in their clients' rooms and for the studio. */
async function taskWriter(
  deps: TasksDeps,
  claims: VerifiedClaims,
  clientId: string | null,
): Promise<Actor | null> {
  if (clientId) return roomActor(deps.contexts, claims, clientId, 'write');
  return withActor(
    deps.contexts,
    claims,
    async (_tx, actor) =>
      actor.mfaVerifiedAt !== null &&
      actor.roles.some((role) => role === 'founder' || role === 'project_manager')
        ? actor
        : null,
    null,
  );
}

async function validAssignee(
  tx: DbTransaction,
  organizationId: string,
  clientId: string | null,
  assigneeId: string,
  projectId: string | null = null,
): Promise<boolean> {
  if (clientId) return isRoomStaff(tx, organizationId, clientId, assigneeId, projectId);
  const [member] = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, assigneeId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
        inArray(organizationMemberships.role, ['founder', 'project_manager', 'freelancer']),
      ),
    )
    .limit(1);
  return member !== undefined;
}

export async function createTask(
  claims: VerifiedClaims,
  input: TaskInput,
  deps: TasksDeps,
): Promise<{ ok: true; taskId: string } | NotFound | { ok: false; rule: 'invalid_input' }> {
  const clientId = input.clientId ?? null;
  if (clientId && !z.uuid().safeParse(clientId).success) return NOT_FOUND;
  const actor = await taskWriter(deps, claims, clientId);
  if (!actor) return NOT_FOUND;
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const data = parsed.data;

  return deps.contexts.withSystemContext(async (tx) => {
    if (
      data.assigneeId &&
      !(await validAssignee(
        tx,
        actor.organizationId,
        clientId,
        data.assigneeId,
        data.projectId ?? null,
      ))
    ) {
      return { ok: false as const, rule: 'invalid_input' as const };
    }
    if (data.projectId) {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, data.projectId), eq(projects.clientId, clientId ?? '')));
      if (!project) return { ok: false as const, rule: 'invalid_input' as const };
    }
    const [task] = await tx
      .insert(tasks)
      .values({
        organizationId: actor.organizationId,
        clientId,
        projectId: data.projectId ?? null,
        title: data.title,
        notes: data.notes ?? '',
        assigneeId: data.assigneeId ?? null,
        dueOn: data.dueOn ?? null,
        createdBy: actor.userId,
      })
      .returning({ id: tasks.id });
    if (!task) throw new Error('Task was not created');
    if (data.items && data.items.length > 0) {
      await tx.insert(taskItems).values(
        data.items.map((item, index) => ({
          organizationId: actor.organizationId,
          taskId: task.id,
          position: index + 1,
          title: item,
        })),
      );
    }
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'task.created',
      resourceType: 'task',
      resourceId: task.id,
      clientId,
      metadata: { source: 'manual' },
    });
    if (data.assigneeId && data.assigneeId !== actor.userId) {
      await emitAssigned(tx, actor.organizationId, clientId, task.id, data.assigneeId);
    }
    return { ok: true as const, taskId: task.id };
  });
}

/** Someone other than the caller now has the task; they are told by email. */
function emitAssigned(
  tx: DbTransaction,
  organizationId: string,
  clientId: string | null,
  taskId: string,
  assigneeId: string,
): Promise<string> {
  return emit(tx, {
    type: 'tasks.task.assigned',
    organizationId,
    clientId: clientId ?? undefined,
    payload: { taskId, assigneeId },
  });
}

/** The task as the caller may read it (row level security), or null. */
async function readableTask(deps: TasksDeps, claims: VerifiedClaims, taskId: string) {
  if (!z.uuid().safeParse(taskId).success) return null;
  return deps.contexts.withUserContext(claims, async (tx) => {
    const [task] = await tx
      .select({
        id: tasks.id,
        clientId: tasks.clientId,
        projectId: tasks.projectId,
        assigneeId: tasks.assigneeId,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    return task ?? null;
  });
}

export async function updateTask(
  claims: VerifiedClaims,
  input: { taskId: string } & Partial<Omit<TaskInput, 'clientId' | 'projectId' | 'items'>>,
  deps: TasksDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_input' }> {
  const task = await readableTask(deps, claims, input.taskId);
  const actor = task ? await taskWriter(deps, claims, task.clientId) : null;
  if (!task || !actor) return NOT_FOUND;
  const parsed = taskSchema
    .pick({ title: true, notes: true, assigneeId: true, dueOn: true })
    .partial()
    .safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const patch = parsed.data;

  return deps.contexts.withSystemContext(async (tx) => {
    if (
      patch.assigneeId &&
      patch.assigneeId !== task.assigneeId &&
      !(await validAssignee(
        tx,
        actor.organizationId,
        task.clientId,
        patch.assigneeId,
        task.projectId,
      ))
    ) {
      return { ok: false as const, rule: 'invalid_input' as const };
    }
    await tx.update(tasks).set(patch).where(eq(tasks.id, task.id));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'task.updated',
      resourceType: 'task',
      resourceId: task.id,
      clientId: task.clientId,
      metadata: patch,
    });
    if (
      patch.assigneeId &&
      patch.assigneeId !== task.assigneeId &&
      patch.assigneeId !== actor.userId
    ) {
      await emitAssigned(tx, actor.organizationId, task.clientId, task.id, patch.assigneeId);
    }
    return { ok: true as const };
  });
}

export async function deleteTask(
  claims: VerifiedClaims,
  input: { taskId: string },
  deps: TasksDeps,
): Promise<{ ok: true } | NotFound> {
  const task = await readableTask(deps, claims, input.taskId);
  const actor = task ? await taskWriter(deps, claims, task.clientId) : null;
  if (!task || !actor) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    await tx.delete(tasks).where(eq(tasks.id, task.id));
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'task.deleted',
      resourceType: 'task',
      resourceId: task.id,
      clientId: task.clientId,
      metadata: {},
    });
  });
  return { ok: true };
}

/** Writers, and the person the task is assigned to, complete or reopen it. */
async function canWork(deps: TasksDeps, claims: VerifiedClaims, taskId: string) {
  const task = await readableTask(deps, claims, taskId);
  if (!task) return null;
  if (task.assigneeId === claims.sub) return task;
  return (await taskWriter(deps, claims, task.clientId)) ? task : null;
}

export async function setTaskStatus(
  claims: VerifiedClaims,
  input: { taskId: string; status: TaskStatus },
  deps: TasksDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_input' }> {
  if (input.status !== 'open' && input.status !== 'done')
    return { ok: false, rule: 'invalid_input' };
  const task = await canWork(deps, claims, input.taskId);
  if (!task) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(tasks)
      .set({ status: input.status, completedAt: input.status === 'done' ? now : null })
      .where(eq(tasks.id, task.id)),
  );
  return { ok: true };
}

export async function setTaskItem(
  claims: VerifiedClaims,
  input: { itemId: string; done: boolean },
  deps: TasksDeps,
): Promise<{ ok: true } | NotFound> {
  if (!z.uuid().safeParse(input.itemId).success) return NOT_FOUND;
  const taskId = await deps.contexts.withUserContext(claims, async (tx) => {
    const [item] = await tx
      .select({ taskId: taskItems.taskId })
      .from(taskItems)
      .where(eq(taskItems.id, input.itemId));
    return item?.taskId ?? null;
  });
  if (!taskId || !(await canWork(deps, claims, taskId))) return NOT_FOUND;
  await deps.contexts.withSystemContext((tx) =>
    tx.update(taskItems).set({ done: input.done }).where(eq(taskItems.id, input.itemId)),
  );
  return { ok: true };
}

/** S-03 and C-03: the tasks the caller can read, with their items, client and assignee. */
export async function listTasks(
  tx: DbTransaction,
  filter: { taskId?: string; clientId?: string; assigneeId?: string; status?: TaskStatus },
): Promise<TaskView[]> {
  const rows = await tx.execute<{
    id: string;
    title: string;
    notes: string;
    client_id: string | null;
    client_name: string | null;
    project_id: string | null;
    assignee_id: string | null;
    assignee_name: string | null;
    due_on: string | null;
    status: TaskStatus;
    can_edit: boolean;
    items_done: number;
    items_total: number;
    comment_count: number;
    file_count: number;
  }>(sql`
    select t.id, t.title, t.notes, t.client_id, c.name as client_name, t.project_id, t.assignee_id,
           p.full_name as assignee_name, t.due_on::text as due_on, t.status::text as status,
           case
             when t.client_id is null then app.has_org_role(
               t.organization_id, array['founder', 'project_manager']::app.org_role[]
             )
             else app.can_write_rooms(t.organization_id, t.client_id)
           end as can_edit,
           (select count(*) filter (where i.done) from public.task_items i where i.task_id = t.id)::int as items_done,
           (select count(*) from public.task_items i where i.task_id = t.id)::int as items_total,
           (select count(*) from public.task_comments k where k.task_id = t.id)::int as comment_count,
           (select count(*) from public.task_files f where f.task_id = t.id)::int as file_count
    from public.tasks t
    left join public.clients c on c.id = t.client_id
    left join public.profiles p on p.id = t.assignee_id
    where (${filter.taskId ?? null}::uuid is null or t.id = ${filter.taskId ?? null}::uuid)
      and (${filter.clientId ?? null}::uuid is null or t.client_id = ${filter.clientId ?? null}::uuid)
      and (${filter.assigneeId ?? null}::uuid is null or t.assignee_id = ${filter.assigneeId ?? null}::uuid)
      and (${filter.status ?? null}::text is null or t.status::text = ${filter.status ?? null}::text)
    order by t.due_on nulls last, t.created_at
  `);
  const ids = rows.map((row) => row.id);
  const items = ids.length
    ? await tx
        .select()
        .from(taskItems)
        .where(inArray(taskItems.taskId, ids))
        .orderBy(asc(taskItems.position))
    : [];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    clientId: row.client_id,
    clientName: row.client_name,
    projectId: row.project_id,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    dueOn: row.due_on,
    status: row.status,
    canEdit: row.can_edit,
    itemsDone: row.items_done,
    itemsTotal: row.items_total,
    commentCount: row.comment_count,
    fileCount: row.file_count,
    items: items
      .filter((item) => item.taskId === row.id)
      .map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title,
        done: item.done,
      })),
  }));
}

export type TaskCounts = { open: number; done: number; all: number };

/** Tasks per status under the client and assignee filters of the list, in the caller's context. */
export async function countTasksByStatus(
  tx: DbTransaction,
  filter: { clientId?: string; assigneeId?: string },
): Promise<TaskCounts> {
  const rows = await tx.execute<{ status: TaskStatus; count: string }>(sql`
    select t.status::text as status, count(*)::text as count
    from public.tasks t
    where (${filter.clientId ?? null}::uuid is null or t.client_id = ${filter.clientId ?? null}::uuid)
      and (${filter.assigneeId ?? null}::uuid is null or t.assignee_id = ${filter.assigneeId ?? null}::uuid)
    group by t.status
  `);
  const countOf = (status: TaskStatus) =>
    Number(rows.find((row) => row.status === status)?.count ?? 0);
  const open = countOf('open');
  const done = countOf('done');
  return { open, done, all: open + done };
}

/**
 * AUT-13: "Agendar kickoff" and "Enviar kit de boas-vindas" for a project started from 2.2, once
 * each, assigned to the client's project manager when there is exactly one.
 */
export async function createKickoffTasks(
  projectId: string,
  deps: TasksDeps,
): Promise<{ created: number }> {
  if (!z.uuid().safeParse(projectId).success) return { created: 0 };
  const now = (deps.now ?? (() => new Date()))();
  return deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ organizationId: projects.organizationId, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return { created: 0 };
    const managers = await tx
      .select({ userId: clientStaffAssignments.userId })
      .from(clientStaffAssignments)
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.userId, clientStaffAssignments.userId),
          eq(organizationMemberships.organizationId, project.organizationId),
        ),
      )
      .where(
        and(
          eq(clientStaffAssignments.clientId, project.clientId),
          eq(organizationMemberships.role, 'project_manager'),
          eq(organizationMemberships.status, 'active'),
        ),
      );
    const assigneeId = managers.length === 1 ? (managers[0]?.userId ?? null) : null;
    const inserted = await tx
      .insert(tasks)
      .values(
        KICKOFF_TASKS.map((task) => ({
          organizationId: project.organizationId,
          clientId: project.clientId,
          projectId,
          title: task.title,
          source: task.source,
          assigneeId,
          dueOn: lisbonDay(now, task.days),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    return { created: inserted.length };
  });
}
