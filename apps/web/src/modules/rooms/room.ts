import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import { roomActor } from './authorize';
import type { RoomsDeps } from './runtime-types';
import {
  FEED_LIMIT,
  isoOrNull,
  pickProject,
  type ClientRoomView,
  type Person,
  type PhaseView,
  type ProjectView,
  type RoomView,
} from './views';

const {
  approvals,
  clients,
  organizationMemberships,
  profiles,
  projectPhases,
  projectSteps,
  projectUpdates,
  projects,
} = schema;

type BuildMode = { clientView: boolean };

/**
 * Reads a project with its phases, steps, updates and approvals. In client view it applies the
 * same filters as the portal views: only client-visible steps and updates, no withdrawn approvals
 * and no cancelled projects (RN-50, US-12).
 */
async function buildProject(
  tx: DbTransaction,
  clientId: string,
  projectId: string | undefined,
  mode: BuildMode,
) {
  const projectRows = await tx
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.clientId, clientId),
        mode.clientView ? ne(projects.status, 'cancelled') : undefined,
      ),
    )
    .orderBy(desc(projects.createdAt), asc(projects.id));
  const summaries = projectRows.map((row) => ({ id: row.id, name: row.name, status: row.status }));
  const selected = pickProject(projectRows, projectId);
  if (!selected) return { summaries, project: null };

  const phaseRows = await tx
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, selected.id))
    .orderBy(asc(projectPhases.position));
  const stepRows = await tx
    .select()
    .from(projectSteps)
    .where(
      and(
        eq(projectSteps.projectId, selected.id),
        mode.clientView ? eq(projectSteps.visibleToClient, true) : undefined,
      ),
    )
    .orderBy(asc(projectSteps.position));
  const updateRows = await tx
    .select({
      id: projectUpdates.id,
      kind: projectUpdates.kind,
      body: projectUpdates.body,
      milestone: projectUpdates.milestone,
      visibility: projectUpdates.visibility,
      createdAt: projectUpdates.createdAt,
      authorName: profiles.fullName,
    })
    .from(projectUpdates)
    .leftJoin(profiles, eq(profiles.id, projectUpdates.authorId))
    .where(
      and(
        eq(projectUpdates.projectId, selected.id),
        mode.clientView ? eq(projectUpdates.visibility, 'client') : undefined,
      ),
    )
    .orderBy(desc(projectUpdates.createdAt), asc(projectUpdates.id))
    .limit(FEED_LIMIT);
  const approvalRows = await tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.projectId, selected.id), ne(approvals.status, 'withdrawn')))
    .orderBy(desc(approvals.requestedAt), asc(approvals.id));

  const phases: PhaseView[] = phaseRows.map((phase) => ({
    id: phase.id,
    position: phase.position,
    name: phase.name,
    status: phase.status,
    requiresApproval: phase.requiresApproval,
    dueOn: phase.dueOn,
    startedAt: isoOrNull(phase.startedAt),
    completedAt: isoOrNull(phase.completedAt),
    codeOnStart: phase.codeOnStart,
    codeOnDone: phase.codeOnDone,
    steps: stepRows
      .filter((step) => step.phaseId === phase.id)
      .map((step) => ({
        id: step.id,
        position: step.position,
        name: step.name,
        status: step.status,
        dueOn: step.dueOn,
        reopened: step.reopenedAfterShared,
        visibleToClient: step.visibleToClient,
        chained: step.chained,
        shared: step.sharedAt !== null,
        assigneeId: step.assigneeId,
      })),
  }));

  const project: ProjectView = {
    id: selected.id,
    name: selected.name,
    status: selected.status,
    startsOn: selected.startsOn,
    endsOn: selected.endsOn,
    dealId: selected.dealId,
    phases,
    updates: updateRows.map((update) => ({
      id: update.id,
      kind: update.kind,
      body: update.body,
      milestone: update.milestone,
      authorName: update.authorName,
      createdAt: update.createdAt.toISOString(),
      visibility: update.visibility,
    })),
    approvals: approvalRows.map((approval) => ({
      id: approval.id,
      phaseId: approval.subjectId,
      phaseName: phases.find((phase) => phase.id === approval.subjectId)?.name ?? '',
      status: approval.status,
      requestedAt: approval.requestedAt.toISOString(),
      decidedAt: isoOrNull(approval.decidedAt),
      comment: approval.comment,
    })),
  };
  return { summaries, project };
}

async function assignablePeople(tx: DbTransaction, organizationId: string): Promise<Person[]> {
  const rows = await tx
    .selectDistinct({ id: profiles.id, name: profiles.fullName })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
        inArray(organizationMemberships.role, ['founder', 'project_manager', 'freelancer']),
      ),
    )
    .orderBy(asc(profiles.fullName));
  return rows;
}

/** C-01 and C-02: the client's room for the team, with internal items. */
export async function loadRoom(
  claims: VerifiedClaims,
  input: { clientId: string; projectId?: string },
  deps: Pick<RoomsDeps, 'contexts'>,
): Promise<RoomView | null> {
  if (input.projectId && !z.uuid().safeParse(input.projectId).success) return null;
  const actor = await roomActor(deps.contexts, claims, input.clientId, 'read');
  if (!actor) return null;
  return deps.contexts.withSystemContext(async (tx) => {
    const [client] = await tx
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, input.clientId));
    if (!client) return null;
    const { summaries, project } = await buildProject(tx, input.clientId, input.projectId, {
      clientView: false,
    });
    return {
      clientId: input.clientId,
      clientName: client.name,
      projects: summaries,
      project,
      people: await assignablePeople(tx, actor.organizationId),
    };
  });
}

/** "Ver como cliente" (US-12): the room exactly as the client sees it in the portal. */
export async function loadRoomPreview(
  claims: VerifiedClaims,
  input: { clientId: string; projectId?: string },
  deps: Pick<RoomsDeps, 'contexts'>,
): Promise<ClientRoomView | null> {
  if (input.projectId && !z.uuid().safeParse(input.projectId).success) return null;
  const actor = await roomActor(deps.contexts, claims, input.clientId, 'read');
  if (!actor) return null;
  return deps.contexts.withSystemContext(async (tx) => {
    const { summaries, project } = await buildProject(tx, input.clientId, input.projectId, {
      clientView: true,
    });
    if (summaries.length === 0) return null;
    if (!project) return { projects: summaries, project: null };
    return {
      projects: summaries,
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        startsOn: project.startsOn,
        endsOn: project.endsOn,
        phases: project.phases.map((phase) => ({
          id: phase.id,
          position: phase.position,
          name: phase.name,
          status: phase.status,
          requiresApproval: phase.requiresApproval,
          dueOn: phase.dueOn,
          startedAt: phase.startedAt,
          completedAt: phase.completedAt,
          steps: phase.steps.map((step) => ({
            id: step.id,
            position: step.position,
            name: step.name,
            status: step.status,
            dueOn: step.dueOn,
            reopened: step.reopened,
          })),
        })),
        updates: project.updates.map((update) => ({
          id: update.id,
          kind: update.kind,
          body: update.body,
          milestone: update.milestone,
          authorName: update.authorName,
          createdAt: update.createdAt,
        })),
        approvals: project.approvals,
      },
    };
  });
}
