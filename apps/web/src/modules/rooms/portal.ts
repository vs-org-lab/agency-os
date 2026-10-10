import { sql } from 'drizzle-orm';
import type {
  ApprovalStatus,
  DbTransaction,
  LibraryFileKind,
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
  type UpdateFileView,
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
      where project_id = ${selected.id}::uuid and subject_type = 'phase'
      order by requested_at desc, id
    `),
  ]);

  const attachments = new Map<string, UpdateFileView[]>();
  if (updates.length > 0) {
    const rows = await tx.execute<{
      update_id: string;
      file_id: string;
      name: string;
      kind: LibraryFileKind;
      size_bytes: string;
    }>(sql`
      select update_id, file_id, name, kind::text as kind, size_bytes::text as size_bytes
      from public.portal_update_files
      where update_id in (${sql.join(
        updates.map((update) => sql`${update.id}::uuid`),
        sql`, `,
      )})
      order by lower(name), file_id
    `);
    for (const row of rows) {
      const files = attachments.get(row.update_id) ?? [];
      files.push({
        id: row.file_id,
        name: row.name,
        kind: row.kind,
        sizeBytes: Number(row.size_bytes),
      });
      attachments.set(row.update_id, files);
    }
  }

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
        files: attachments.get(update.id) ?? [],
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

export type ClientPendingApproval = {
  id: string;
  kind: 'phase' | 'file' | 'delivery';
  projectId: string;
  projectName: string;
  /** The phase name, the file title or, for the final approval, the project name. */
  subjectName: string;
  /** The file version to open, for file approvals. */
  versionId: string | null;
  requestedAt: string;
};

/** P-02: every approval waiting for the client, across all of the client's projects. */
export async function getClientApprovals(
  tx: DbTransaction,
  clientId: string,
): Promise<ClientPendingApproval[]> {
  const rows = await tx.execute<{
    id: string;
    kind: 'phase' | 'file' | 'delivery';
    project_id: string;
    project_name: string;
    subject_name: string;
    version_id: string | null;
    requested_at: Timestamp;
  }>(sql`
    select a.id, 'phase' as kind, a.project_id, p.name as project_name,
           ph.name as subject_name, null::uuid as version_id, a.requested_at
    from public.portal_approvals a
    join public.portal_projects p on p.id = a.project_id
    join public.portal_project_phases ph on ph.id = a.subject_id
    where a.client_id = ${clientId}::uuid and a.status = 'pending' and a.subject_type = 'phase'
    union all
    select a.id, 'file' as kind, a.project_id, p.name as project_name,
           v.title as subject_name, v.id as version_id, a.requested_at
    from public.portal_approvals a
    join public.portal_projects p on p.id = a.project_id
    join public.portal_proof_versions v on v.id = a.subject_id
    where a.client_id = ${clientId}::uuid and a.status = 'pending'
      and a.subject_type = 'file_version'
    union all
    select a.id, 'delivery' as kind, a.project_id, p.name as project_name,
           p.name as subject_name, null::uuid as version_id, a.requested_at
    from public.portal_approvals a
    join public.portal_projects p on p.id = a.subject_id
    where a.client_id = ${clientId}::uuid and a.status = 'pending' and a.subject_type = 'project'
    order by requested_at desc, id
  `);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    projectId: row.project_id,
    projectName: row.project_name,
    subjectName: row.subject_name,
    versionId: row.version_id,
    requestedAt: new Date(row.requested_at).toISOString(),
  }));
}
