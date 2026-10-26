import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { withActor } from '@/modules/access';
import type { VerifiedClaims } from '@/platform/db';
import { canCreateTasks } from './domain/creators';
import { canTakeTask, type TaskPerson } from './domain/people';
import type { TasksDeps } from './service';

const { clientStaffAssignments, clients, organizationMemberships, profiles } = schema;

export type TaskOption = { id: string; name: string };

export type TaskOptions = {
  clients: TaskOption[];
  people: TaskPerson[];
  /** Founders and project managers create tasks; everyone else only completes their own. */
  canCreate: boolean;
};

const STAFF_ROLES = ['founder', 'project_manager', 'freelancer', 'finance'];

/**
 * Choices for the task filters and form: the clients the caller can read and the people a task may
 * go to. In a room these are the founders and the client's assigned staff, matching what
 * `createTask` accepts; for the studio, every active founder, manager and freelancer.
 */
export async function listTaskOptions(
  claims: VerifiedClaims,
  clientId: string | null,
  deps: Pick<TasksDeps, 'contexts'>,
): Promise<TaskOptions | null> {
  if (clientId && !z.uuid().safeParse(clientId).success) return null;
  const scope = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (actor.mfaVerifiedAt === null || !actor.roles.some((role) => STAFF_ROLES.includes(role))) {
        return null;
      }
      const readable = await tx
        .select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, actor.organizationId),
            sql`app.can_read_rooms(${actor.organizationId}::uuid, ${clients.id})`,
          ),
        )
        .orderBy(asc(clients.name));
      return {
        organizationId: actor.organizationId,
        clients: readable,
        canCreate: canCreateTasks(actor.roles),
      };
    },
    null,
  );
  if (scope === null) return null;
  if (clientId && !scope.clients.some((client) => client.id === clientId)) return null;

  const { members, assignments } = await deps.contexts.withSystemContext(async (tx) => ({
    members: await tx
      .selectDistinct({
        id: profiles.id,
        name: profiles.fullName,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
      .where(
        and(
          eq(organizationMemberships.organizationId, scope.organizationId),
          eq(organizationMemberships.status, 'active'),
          isNull(organizationMemberships.archivedAt),
          inArray(organizationMemberships.role, ['founder', 'project_manager', 'freelancer']),
        ),
      ),
    assignments: await tx
      .select({ userId: clientStaffAssignments.userId, clientId: clientStaffAssignments.clientId })
      .from(clientStaffAssignments)
      .innerJoin(clients, eq(clients.id, clientStaffAssignments.clientId))
      .where(
        and(
          eq(clients.organizationId, scope.organizationId),
          isNull(clientStaffAssignments.archivedAt),
        ),
      ),
  }));

  const people = new Map<string, TaskPerson>();
  for (const member of members) {
    const current = people.get(member.id);
    const founder = member.role === 'founder' || current?.clientIds === null;
    people.set(member.id, {
      id: member.id,
      name: member.name,
      clientIds: founder
        ? null
        : assignments.filter((row) => row.userId === member.id).map((row) => row.clientId),
    });
  }
  const eligible = [...people.values()].filter(
    (person) => !clientId || canTakeTask(person, clientId),
  );
  return {
    clients: scope.clients,
    people: eligible.sort((left, right) => left.name.localeCompare(right.name)),
    canCreate: scope.canCreate,
  };
}
