import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type OrgRole } from '@agency-os/db';
import { currencies, type Currency } from '@agency-os/i18n';
import { recordAudit } from '@/modules/audit';
import { requireRecentMfa } from '@/modules/identity';
import { taskToday } from '@/modules/tasks';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { founderActor } from './authorize';
import { canLoseFounder } from './domain/guards';
import { weeklyLoad, type WeeklyLoad } from './domain/load';

const {
  clientStaffAssignments,
  clients,
  organizationMemberships,
  projectStaffAssignments,
  projects,
  tasks,
  teamMemberRates,
} = schema;

export type TeamDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  now?: () => Date;
};

export type MemberStatus = 'invited' | 'active' | 'revoked';

export type MemberRates = {
  hourlyCost: string | null;
  currency: Currency;
  weeklyHours: number | null;
};

export type TeamMemberView = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  role: OrgRole;
  status: MemberStatus;
  clientCount: number;
  load: WeeklyLoad;
  rates: MemberRates | null;
};

export type MemberView = TeamMemberView & {
  clients: Array<{ id: string; name: string; assigned: boolean }>;
  projects: Array<{
    id: string;
    name: string;
    clientId: string;
    clientName: string;
    assigned: boolean;
  }>;
};

type Refusal =
  'not_found' | 'invalid_input' | 'invalid_state' | 'reauthentication_required' | 'last_founder';

export type TeamResult = { ok: true } | { ok: false; rule: Refusal };

const ROLES = ['founder', 'project_manager', 'freelancer', 'finance'] as const;
const STAFF_ROLES: OrgRole[] = ['project_manager', 'freelancer'];
const uuid = z.uuid();

function refuse(rule: Refusal): TeamResult {
  return { ok: false, rule };
}

type MemberRow = {
  userId: string;
  membershipId: string;
  name: string;
  email: string | null;
  role: OrgRole;
  status: MemberStatus;
};

async function memberRows(
  tx: DbTransaction,
  organizationId: string,
  userId?: string,
): Promise<MemberRow[]> {
  return tx.execute<MemberRow>(sql`
    select m.user_id as "userId", m.id as "membershipId", p.full_name as name, u.email,
           m.role::text as role, m.status::text as status
    from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.organization_id = ${organizationId}::uuid and m.archived_at is null
      and (${userId ?? null}::uuid is null or m.user_id = ${userId ?? null}::uuid)
    order by p.full_name
  `);
}

async function describeMembers(
  tx: DbTransaction,
  organizationId: string,
  rows: MemberRow[],
  today: string,
): Promise<TeamMemberView[]> {
  if (rows.length === 0) return [];
  const userIds = rows.map((row) => row.userId);
  const assignedClients = await tx
    .select({ userId: clientStaffAssignments.userId, clientId: clientStaffAssignments.clientId })
    .from(clientStaffAssignments)
    .where(
      and(
        eq(clientStaffAssignments.organizationId, organizationId),
        inArray(clientStaffAssignments.userId, userIds),
        isNull(clientStaffAssignments.archivedAt),
      ),
    );
  const assignedProjects = await tx
    .select({
      userId: projectStaffAssignments.userId,
      projectId: projectStaffAssignments.projectId,
    })
    .from(projectStaffAssignments)
    .where(
      and(
        eq(projectStaffAssignments.organizationId, organizationId),
        inArray(projectStaffAssignments.userId, userIds),
        isNull(projectStaffAssignments.archivedAt),
      ),
    );
  const activeProjects = await tx
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.status, 'active')));
  const openTasks = await tx
    .select({ assigneeId: tasks.assigneeId, dueOn: tasks.dueOn })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.status, 'open'),
        inArray(tasks.assigneeId, userIds),
      ),
    );
  const rates = await tx
    .select()
    .from(teamMemberRates)
    .where(
      and(
        eq(teamMemberRates.organizationId, organizationId),
        inArray(teamMemberRates.userId, userIds),
      ),
    );

  return rows.map((row) => {
    const clientIds = new Set(
      assignedClients.filter((entry) => entry.userId === row.userId).map((entry) => entry.clientId),
    );
    const projectIds = new Set(
      assignedProjects
        .filter((entry) => entry.userId === row.userId)
        .map((entry) => entry.projectId),
    );
    const projectCount = activeProjects.filter((project) =>
      row.role === 'freelancer' ? projectIds.has(project.id) : clientIds.has(project.clientId),
    ).length;
    const rate = rates.find((entry) => entry.userId === row.userId);
    return {
      userId: row.userId,
      membershipId: row.membershipId,
      name: row.name,
      email: row.email ?? '',
      role: row.role,
      status: row.status,
      clientCount: clientIds.size,
      load: weeklyLoad({
        taskDueDates: openTasks
          .filter((task) => task.assigneeId === row.userId)
          .map((task) => task.dueOn),
        activeProjects: projectCount,
        today,
      }),
      rates: rate
        ? { hourlyCost: rate.hourlyCost, currency: rate.currency, weeklyHours: rate.weeklyHours }
        : null,
    };
  });
}

/** S-12 › Equipa: every member with status, clients, weekly load and rates. Founders only. */
export async function listTeam(
  claims: VerifiedClaims,
  now: Date,
  deps: TeamDeps,
): Promise<TeamMemberView[] | null> {
  const actor = await founderActor(deps.contexts, claims);
  if (!actor) return null;
  return deps.contexts.withSystemContext(async (tx) =>
    describeMembers(
      tx,
      actor.organizationId,
      await memberRows(tx, actor.organizationId),
      taskToday(now),
    ),
  );
}

/** The member's file: the list fields plus assignable clients and the assigned clients' projects. */
export async function loadMember(
  claims: VerifiedClaims,
  userId: string,
  deps: TeamDeps,
): Promise<MemberView | null> {
  if (!uuid.safeParse(userId).success) return null;
  const actor = await founderActor(deps.contexts, claims);
  if (!actor) return null;
  const now = (deps.now ?? (() => new Date()))();
  return deps.contexts.withSystemContext(async (tx) => {
    const [view] = await describeMembers(
      tx,
      actor.organizationId,
      await memberRows(tx, actor.organizationId, userId),
      taskToday(now),
    );
    if (!view) return null;
    const assigned = await tx
      .select({ clientId: clientStaffAssignments.clientId })
      .from(clientStaffAssignments)
      .where(
        and(
          eq(clientStaffAssignments.userId, userId),
          eq(clientStaffAssignments.organizationId, actor.organizationId),
          isNull(clientStaffAssignments.archivedAt),
        ),
      );
    const assignedClientIds = new Set(assigned.map((row) => row.clientId));
    const organizationClients = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.organizationId, actor.organizationId), isNull(clients.archivedAt)))
      .orderBy(asc(clients.name));
    const clientProjects =
      assignedClientIds.size === 0
        ? []
        : await tx
            .select({
              id: projects.id,
              name: projects.name,
              clientId: projects.clientId,
              clientName: clients.name,
            })
            .from(projects)
            .innerJoin(clients, eq(clients.id, projects.clientId))
            .where(inArray(projects.clientId, [...assignedClientIds]))
            .orderBy(asc(clients.name), asc(projects.createdAt));
    const projectAssignments = await tx
      .select({ projectId: projectStaffAssignments.projectId })
      .from(projectStaffAssignments)
      .where(
        and(eq(projectStaffAssignments.userId, userId), isNull(projectStaffAssignments.archivedAt)),
      );
    const assignedProjectIds = new Set(projectAssignments.map((row) => row.projectId));
    return {
      ...view,
      clients: organizationClients.map((client) => ({
        ...client,
        assigned: assignedClientIds.has(client.id),
      })),
      projects: clientProjects.map((project) => ({
        ...project,
        assigned: assignedProjectIds.has(project.id),
      })),
    };
  });
}

type CriticalContext = { organizationId: string; actorId: string; target: MemberRow };

/**
 * SEC-03 critical changes: founder only, recent MFA, an existing member who is not the caller.
 */
async function criticalChange(
  claims: VerifiedClaims,
  userId: string,
  deps: TeamDeps,
): Promise<CriticalContext | TeamResult> {
  if (!uuid.safeParse(userId).success) return refuse('not_found');
  const actor = await founderActor(deps.contexts, claims);
  if (!actor) return refuse('not_found');
  const now = (deps.now ?? (() => new Date()))();
  if (!requireRecentMfa(claims, now).ok) return refuse('reauthentication_required');
  if (userId === actor.userId) return refuse('invalid_input');
  const [target] = await deps.contexts.withSystemContext((tx) =>
    memberRows(tx, actor.organizationId, userId),
  );
  if (!target) return refuse('not_found');
  return { organizationId: actor.organizationId, actorId: actor.userId, target };
}

async function activeFounderIds(tx: DbTransaction, organizationId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.role, 'founder'),
        eq(organizationMemberships.status, 'active'),
        isNull(organizationMemberships.archivedAt),
      ),
    );
  return rows.map((row) => row.userId);
}

async function audit(
  deps: TeamDeps,
  claims: VerifiedClaims,
  context: CriticalContext,
  action:
    | 'team.role_changed'
    | 'team.access_revoked'
    | 'team.access_restored'
    | 'team.assignment_changed',
  metadata: Record<string, unknown>,
): Promise<void> {
  await deps.contexts.withUserContext(claims, (tx) =>
    recordAudit(tx, {
      organizationId: context.organizationId,
      action,
      resourceType: 'organization_membership',
      resourceId: context.target.membershipId,
      metadata: { userId: context.target.userId, ...metadata },
    }),
  );
}

export async function changeRole(
  claims: VerifiedClaims,
  input: { userId: string; role: OrgRole },
  deps: TeamDeps,
): Promise<TeamResult> {
  if (!(ROLES as readonly string[]).includes(input.role)) return refuse('invalid_input');
  const context = await criticalChange(claims, input.userId, deps);
  if ('ok' in context) return context;
  if (context.target.role === input.role) return { ok: true };
  const outcome = await deps.contexts.withSystemContext(async (tx) => {
    if (
      context.target.role === 'founder' &&
      !canLoseFounder(await activeFounderIds(tx, context.organizationId), input.userId)
    ) {
      return refuse('last_founder');
    }
    await tx
      .update(organizationMemberships)
      .set({ role: input.role })
      .where(eq(organizationMemberships.id, context.target.membershipId));
    return { ok: true } as const;
  });
  if (outcome.ok) {
    await audit(deps, claims, context, 'team.role_changed', {
      from: context.target.role,
      to: input.role,
    });
  }
  return outcome;
}

async function archiveAssignments(
  tx: DbTransaction,
  organizationId: string,
  userId: string,
  now: Date,
  clientId?: string,
): Promise<void> {
  await tx
    .update(projectStaffAssignments)
    .set({ archivedAt: now })
    .where(
      and(
        eq(projectStaffAssignments.organizationId, organizationId),
        eq(projectStaffAssignments.userId, userId),
        clientId ? eq(projectStaffAssignments.clientId, clientId) : undefined,
        isNull(projectStaffAssignments.archivedAt),
      ),
    );
  await tx
    .update(clientStaffAssignments)
    .set({ archivedAt: now })
    .where(
      and(
        eq(clientStaffAssignments.organizationId, organizationId),
        eq(clientStaffAssignments.userId, userId),
        clientId ? eq(clientStaffAssignments.clientId, clientId) : undefined,
        isNull(clientStaffAssignments.archivedAt),
      ),
    );
}

/** Ends access at once: every access rule requires an active membership. */
export async function revokeAccess(
  claims: VerifiedClaims,
  input: { userId: string },
  deps: TeamDeps,
): Promise<TeamResult> {
  const context = await criticalChange(claims, input.userId, deps);
  if ('ok' in context) return context;
  if (context.target.status === 'revoked') return refuse('invalid_state');
  const now = (deps.now ?? (() => new Date()))();
  const outcome = await deps.contexts.withSystemContext(async (tx) => {
    if (
      context.target.role === 'founder' &&
      !canLoseFounder(await activeFounderIds(tx, context.organizationId), input.userId)
    ) {
      return refuse('last_founder');
    }
    await tx
      .update(organizationMemberships)
      .set({ status: 'revoked' })
      .where(eq(organizationMemberships.id, context.target.membershipId));
    await archiveAssignments(tx, context.organizationId, input.userId, now);
    return { ok: true } as const;
  });
  if (outcome.ok) await audit(deps, claims, context, 'team.access_revoked', {});
  return outcome;
}

/** Gives a revoked member access again, without the assignments they had. */
export async function restoreAccess(
  claims: VerifiedClaims,
  input: { userId: string },
  deps: TeamDeps,
): Promise<TeamResult> {
  const context = await criticalChange(claims, input.userId, deps);
  if ('ok' in context) return context;
  if (context.target.status !== 'revoked') return refuse('invalid_state');
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(organizationMemberships)
      .set({ status: 'active' })
      .where(eq(organizationMemberships.id, context.target.membershipId)),
  );
  await audit(deps, claims, context, 'team.access_restored', {});
  return { ok: true };
}

async function assignClient(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  userId: string,
): Promise<void> {
  await tx
    .insert(clientStaffAssignments)
    .values({ organizationId, clientId, userId })
    .onConflictDoUpdate({
      target: [clientStaffAssignments.clientId, clientStaffAssignments.userId],
      set: { archivedAt: null },
    });
}

export async function setClientAssignment(
  claims: VerifiedClaims,
  input: { userId: string; clientId: string; assigned: boolean },
  deps: TeamDeps,
): Promise<TeamResult> {
  if (!uuid.safeParse(input.clientId).success) return refuse('not_found');
  const context = await criticalChange(claims, input.userId, deps);
  if ('ok' in context) return context;
  if (!STAFF_ROLES.includes(context.target.role)) return refuse('invalid_input');
  const now = (deps.now ?? (() => new Date()))();
  const outcome = await deps.contexts.withSystemContext(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(eq(clients.id, input.clientId), eq(clients.organizationId, context.organizationId)),
      );
    if (!client) return refuse('not_found');
    if (input.assigned) {
      await assignClient(tx, context.organizationId, input.clientId, input.userId);
    } else {
      await archiveAssignments(tx, context.organizationId, input.userId, now, input.clientId);
    }
    return { ok: true } as const;
  });
  if (outcome.ok) {
    await audit(deps, claims, context, 'team.assignment_changed', {
      clientId: input.clientId,
      assigned: input.assigned,
    });
  }
  return outcome;
}

/** Freelancers only; assigning a project also assigns its client (spec decision 3). */
export async function setProjectAssignment(
  claims: VerifiedClaims,
  input: { userId: string; projectId: string; assigned: boolean },
  deps: TeamDeps,
): Promise<TeamResult> {
  if (!uuid.safeParse(input.projectId).success) return refuse('not_found');
  const context = await criticalChange(claims, input.userId, deps);
  if ('ok' in context) return context;
  if (context.target.role !== 'freelancer') return refuse('invalid_input');
  const now = (deps.now ?? (() => new Date()))();
  const outcome = await deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id, clientId: projects.clientId })
      .from(projects)
      .where(
        and(eq(projects.id, input.projectId), eq(projects.organizationId, context.organizationId)),
      );
    if (!project) return refuse('not_found');
    if (input.assigned) {
      await assignClient(tx, context.organizationId, project.clientId, input.userId);
      await tx
        .insert(projectStaffAssignments)
        .values({
          organizationId: context.organizationId,
          clientId: project.clientId,
          projectId: project.id,
          userId: input.userId,
        })
        .onConflictDoUpdate({
          target: [projectStaffAssignments.projectId, projectStaffAssignments.userId],
          set: { archivedAt: null },
        });
    } else {
      await tx
        .update(projectStaffAssignments)
        .set({ archivedAt: now })
        .where(
          and(
            eq(projectStaffAssignments.projectId, project.id),
            eq(projectStaffAssignments.userId, input.userId),
          ),
        );
    }
    return { ok: true } as const;
  });
  if (outcome.ok) {
    await audit(deps, claims, context, 'team.assignment_changed', {
      projectId: input.projectId,
      assigned: input.assigned,
    });
  }
  return outcome;
}

const ratesSchema = z.object({
  userId: z.uuid(),
  hourlyCost: z
    .string()
    .trim()
    .regex(/^\d{1,8}(\.\d{1,2})?$/)
    .nullable(),
  currency: z.enum(currencies),
  weeklyHours: z.number().int().min(0).max(80).nullable(),
});

/** Hourly cost and weekly hours; values, so founders only (RN-51). */
export async function setRates(
  claims: VerifiedClaims,
  input: z.input<typeof ratesSchema>,
  deps: TeamDeps,
): Promise<TeamResult> {
  const actor = await founderActor(deps.contexts, claims);
  if (!actor) return refuse('not_found');
  const parsed = ratesSchema.safeParse(input);
  if (!parsed.success) return refuse('invalid_input');
  const { userId, hourlyCost, currency, weeklyHours } = parsed.data;
  const saved = await deps.contexts.withSystemContext(async (tx) => {
    const [member] = await memberRows(tx, actor.organizationId, userId);
    if (!member) return false;
    await tx
      .insert(teamMemberRates)
      .values({ organizationId: actor.organizationId, userId, hourlyCost, currency, weeklyHours })
      .onConflictDoUpdate({
        target: [teamMemberRates.organizationId, teamMemberRates.userId],
        set: { hourlyCost, currency, weeklyHours },
      });
    return true;
  });
  if (!saved) return refuse('not_found');
  await deps.contexts.withUserContext(claims, (tx) =>
    recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'team.rates_updated',
      resourceType: 'team_member_rates',
      resourceId: userId,
    }),
  );
  return { ok: true };
}
