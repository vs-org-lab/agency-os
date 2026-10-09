import { sql } from 'drizzle-orm';
import type {
  ApprovalStatus,
  DbTransaction,
  PhaseStatus,
  ProjectStatus,
  StepStatus,
  UpdateKind,
} from '@agency-os/db';
import {
  FEED_LIMIT,
  isoOrNull,
  pickProject,
  type ClientPhaseView,
  type ClientRoomView,
} from './views';

type Timestamp = string | Date;

/**
 * P-01, P-02 and P-05: the client's room read through the portal views, which expose only
 * client-visible items to the decision maker and operational users.
 */
export async function getClientRoom(
  tx: DbTransaction,
  clientId: string,
  projectId?: string,
): Promise<ClientRoomView | null> {
  const projects = await tx.execute<{
    id: string;
    name: string;
    status: ProjectStatus;
    starts_on: string;
    ends_on: string | null;
  }>(sql`
    select id, name, status::text as status, starts_on::text as starts_on, ends_on::text as ends_on
    from public.portal_projects
    where client_id = ${clientId}::uuid
    order by created_at desc, id
  `);
  if (projects.length === 0) return null;
  const summaries = projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
  }));
  const selected = pickProject(projects, projectId);
  if (!selected) return { projects: summaries, project: null };

  const [phases, steps, updates, approvals] = await Promise.all([
    tx.execute<{
      id: string;
      position: number;
      name: string;
      status: PhaseStatus;
      requires_approval: boolean;
      due_on: string | null;
      started_at: Timestamp | null;
      completed_at: Timestamp | null;
    }>(sql`
      select id, position, name, status::text as status, requires_approval, due_on::text as due_on,
             started_at, completed_at
      from public.portal_project_phases
      where project_id = ${selected.id}::uuid
      order by position
    `),
    tx.execute<{
      id: string;
      phase_id: string;
      position: number;
      name: string;
      status: StepStatus;
      due_on: string | null;
      reopened_after_shared: boolean;
    }>(sql`
      select id, phase_id, position, name, status::text as status, due_on::text as due_on,
             reopened_after_shared
      from public.portal_project_steps
      where project_id = ${selected.id}::uuid
      order by position
    `),
    tx.execute<{
      id: string;
      kind: UpdateKind;
      body: string;
      milestone: string | null;
      author_name: string | null;
      created_at: Timestamp;
    }>(sql`
      select id, kind::text as kind, body, milestone, author_name, created_at
      from public.portal_project_updates
      where project_id = ${selected.id}::uuid
      order by created_at desc, id
      limit ${FEED_LIMIT}
    `),
    tx.execute<{
      id: string;
      subject_id: string;
      status: ApprovalStatus;
      requested_at: Timestamp;
      decided_at: Timestamp | null;
      comment: string | null;
    }>(sql`
      select id, subject_id, status::text as status, requested_at, decided_at, comment
      from public.portal_approvals
      where project_id = ${selected.id}::uuid
      order by requested_at desc, id
    `),
  ]);

  const phaseViews: ClientPhaseView[] = phases.map((phase) => ({
    id: phase.id,
    position: phase.position,
    name: phase.name,
    status: phase.status,
    requiresApproval: phase.requires_approval,
    dueOn: phase.due_on,
    startedAt: isoOrNull(phase.started_at),
    completedAt: isoOrNull(phase.completed_at),
    steps: steps
      .filter((step) => step.phase_id === phase.id)
      .map((step) => ({
        id: step.id,
        position: step.position,
        name: step.name,
        status: step.status,
        dueOn: step.due_on,
        reopened: step.reopened_after_shared,
      })),
  }));

  return {
    projects: summaries,
    project: {
      id: selected.id,
      name: selected.name,
      status: selected.status,
      startsOn: selected.starts_on,
      endsOn: selected.ends_on,
      phases: phaseViews,
      updates: updates.map((update) => ({
        id: update.id,
        kind: update.kind,
        body: update.body,
        milestone: update.milestone,
        authorName: update.author_name,
        createdAt: new Date(update.created_at).toISOString(),
      })),
      approvals: approvals.map((approval) => ({
        id: approval.id,
        phaseId: approval.subject_id,
        phaseName: phaseViews.find((phase) => phase.id === approval.subject_id)?.name ?? '',
        status: approval.status,
        requestedAt: new Date(approval.requested_at).toISOString(),
        decidedAt: isoOrNull(approval.decided_at),
        comment: approval.comment,
      })),
    },
  };
}
