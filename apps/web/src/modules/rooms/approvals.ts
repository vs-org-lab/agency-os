import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type ApprovalStatus,
  type ApprovalSubject,
  type DbTransaction,
} from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { roomActor } from './authorize';
import { soleClientManager } from './managers';
import { completePhaseInTx } from './process';
import type { RoomsDeps } from './runtime-types';

const { approvals, projectPhases, projectSteps, projectUpdates, projects, tasks } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

export const MAX_APPROVAL_COMMENT = 2000;

/** "Pedir aprovação": a phase that requires approval, with every step done, waits for the client. */
export async function requestPhaseApproval(
  claims: VerifiedClaims,
  input: { phaseId: string },
  deps: RoomsDeps,
): Promise<
  | { ok: true; approvalId: string }
  | { ok: false; rule: 'not_found' | 'invalid_state' | 'steps_open' }
> {
  if (!z.uuid().safeParse(input.phaseId).success) return NOT_FOUND;
  const clientId = await deps.contexts.withUserContext(claims, async (tx) => {
    const [phase] = await tx
      .select({ clientId: projectPhases.clientId })
      .from(projectPhases)
      .where(eq(projectPhases.id, input.phaseId));
    return phase?.clientId ?? null;
  });
  const actor = clientId ? await roomActor(deps.contexts, claims, clientId, 'write') : null;
  if (!actor) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [phase] = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.id, input.phaseId))
      .for('update');
    if (!phase) return NOT_FOUND;
    if (phase.status !== 'in_progress' || !phase.requiresApproval) {
      return { ok: false as const, rule: 'invalid_state' as const };
    }
    const open = await tx
      .select({ id: projectSteps.id })
      .from(projectSteps)
      .where(and(eq(projectSteps.phaseId, phase.id), ne(projectSteps.status, 'done')))
      .limit(1);
    if (open.length > 0) return { ok: false as const, rule: 'steps_open' as const };

    const [approval] = await tx
      .insert(approvals)
      .values({
        organizationId: phase.organizationId,
        clientId: phase.clientId,
        projectId: phase.projectId,
        subjectType: 'phase',
        subjectId: phase.id,
        requestedBy: actor.userId,
        requestedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error('Approval was not requested');
    await tx
      .update(projectPhases)
      .set({ status: 'awaiting_approval' })
      .where(eq(projectPhases.id, phase.id));
    await recordAudit(tx, {
      organizationId: phase.organizationId,
      action: 'approval.requested',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: phase.clientId,
      metadata: { subject: 'phase', subjectId: phase.id },
    });
    await emit(tx, {
      type: 'rooms.approval.requested',
      organizationId: phase.organizationId,
      clientId: phase.clientId,
      payload: { projectId: phase.projectId, approvalId: approval.id },
    });
    return { ok: true as const, approvalId: approval.id };
  });

  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

/** The task that brings a final approval with requested changes back to the client's manager. */
export const FINAL_REVIEW_TASK = 'Rever entrega final';

/**
 * "Pedir aprovação final": a completed project, with every phase done, waits for the client's
 * final approval (spec 2D.2, decision 5). A pending request is returned as it is; an approved one
 * cannot be asked again.
 */
export async function requestFinalApproval(
  claims: VerifiedClaims,
  input: { projectId: string },
  deps: RoomsDeps,
): Promise<{ ok: true; approvalId: string } | { ok: false; rule: 'not_found' | 'invalid_state' }> {
  if (!z.uuid().safeParse(input.projectId).success) return NOT_FOUND;
  const clientId = await deps.contexts.withUserContext(claims, async (tx) => {
    const [project] = await tx
      .select({ clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    return project?.clientId ?? null;
  });
  const actor = clientId ? await roomActor(deps.contexts, claims, clientId, 'write') : null;
  if (!actor) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .for('update');
    if (!project || project.organizationId !== actor.organizationId) return NOT_FOUND;
    const [existing] = await tx
      .select({ id: approvals.id, status: approvals.status })
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, 'project'),
          eq(approvals.subjectId, project.id),
          inArray(approvals.status, ['pending', 'approved']),
        ),
      )
      .limit(1);
    if (existing?.status === 'pending') {
      return { ok: true as const, approvalId: existing.id, created: false };
    }
    const open = await tx
      .select({ id: projectPhases.id })
      .from(projectPhases)
      .where(and(eq(projectPhases.projectId, project.id), ne(projectPhases.status, 'done')))
      .limit(1);
    if (existing || project.status !== 'completed' || open.length > 0) {
      return { ok: false as const, rule: 'invalid_state' as const };
    }

    const [approval] = await tx
      .insert(approvals)
      .values({
        organizationId: project.organizationId,
        clientId: project.clientId,
        projectId: project.id,
        subjectType: 'project',
        subjectId: project.id,
        requestedBy: actor.userId,
        requestedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error('Final approval was not requested');
    await recordAudit(tx, {
      organizationId: project.organizationId,
      action: 'approval.requested',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: project.clientId,
      metadata: { subject: 'project', subjectId: project.id },
    });
    await emit(tx, {
      type: 'rooms.approval.requested',
      organizationId: project.organizationId,
      clientId: project.clientId,
      payload: { projectId: project.id, approvalId: approval.id },
    });
    return { ok: true as const, approvalId: approval.id, created: true };
  });

  if (!result.ok) return result;
  if (result.created) await (deps.flush ?? requestFlush)();
  return { ok: true, approvalId: result.approvalId };
}

type ApprovalRow = typeof approvals.$inferSelect;

/**
 * The final approval's effects: approved delivers the project and emits
 * `rooms.project.delivered`; changes requested opens the review task for the client's manager.
 */
async function decideProjectInTx(
  tx: DbTransaction,
  approval: ApprovalRow,
  decision: ApprovalDecision,
  comment: string,
  now: Date,
): Promise<void> {
  if (decision === 'changes_requested') {
    await tx.insert(tasks).values({
      organizationId: approval.organizationId,
      clientId: approval.clientId,
      projectId: approval.projectId,
      title: FINAL_REVIEW_TASK,
      notes: comment,
      assigneeId: await soleClientManager(tx, approval.clientId),
      dueOn: LISBON_DATE.format(new Date(now.getTime() + 2 * DAY_MS)),
    });
    return;
  }
  const [project] = await tx
    .update(projects)
    .set({ status: 'delivered', deliveredAt: now })
    .where(eq(projects.id, approval.projectId))
    .returning({ name: projects.name });
  if (!project) throw new Error('Delivered project was not found');
  await tx.insert(projectUpdates).values({
    organizationId: approval.organizationId,
    clientId: approval.clientId,
    projectId: approval.projectId,
    kind: 'project_delivered',
    body: project.name,
    visibility: 'client',
  });
  await recordAudit(tx, {
    organizationId: approval.organizationId,
    action: 'project.delivered',
    resourceType: 'project',
    resourceId: approval.projectId,
    clientId: approval.clientId,
    metadata: { approvalId: approval.id },
  });
  await emit(tx, {
    type: 'rooms.project.delivered',
    organizationId: approval.organizationId,
    clientId: approval.clientId,
    payload: { projectId: approval.projectId },
  });
}

/** A phase approval's effects: approved completes the phase; changes return it to the team. */
async function decidePhaseInTx(
  tx: DbTransaction,
  approval: ApprovalRow,
  decision: ApprovalDecision,
  deciderId: string,
  deps: RoomsDeps,
  now: Date,
): Promise<void> {
  const [phase] = await tx
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.id, approval.subjectId))
    .for('update');
  if (!phase) throw new Error('Approved phase was not found');
  if (decision === 'approved') {
    const completed = await completePhaseInTx(tx, phase, deps, now);
    if (!completed.ok) throw new Error(`Approved phase could not complete: ${completed.rule}`);
    return;
  }
  await tx
    .update(projectPhases)
    .set({ status: 'in_progress' })
    .where(eq(projectPhases.id, phase.id));
  await tx.insert(projectUpdates).values({
    organizationId: phase.organizationId,
    clientId: phase.clientId,
    projectId: phase.projectId,
    authorId: deciderId,
    kind: 'approval_decided',
    body: phase.name,
    visibility: 'client',
  });
}

export type ApprovalDecision = 'approved' | 'changes_requested';

/**
 * The room's own approvals: phases and the project's delivery. Files, documents, Brand Hub
 * publications and retainer extras are decided where their consequences live.
 */
const ROOM_SUBJECTS: readonly ApprovalSubject[] = ['phase', 'project'];

/**
 * The client's decision maker approves a phase or asks for changes, with a comment (RN-41).
 * File version approvals are decided by the proofing module.
 * Approving completes the phase; asking for changes returns it to the team. A decided approval
 * keeps its first decision.
 */
export async function decideApproval(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: ApprovalDecision; comment: string },
  deps: RoomsDeps,
): Promise<
  | { ok: true; status: ApprovalStatus }
  | { ok: false; rule: 'not_found' | 'comment_required' | 'invalid_input' }
> {
  if (!z.uuid().safeParse(input.approvalId).success) return NOT_FOUND;
  if (input.decision !== 'approved' && input.decision !== 'changes_requested') {
    return { ok: false, rule: 'invalid_input' };
  }
  const decider = await deps.contexts.withUserContext(claims, async (tx) => {
    const rows = await tx.execute<{ allowed: boolean }>(sql`
      select app.is_client_member(a.client_id, array['decision_maker']::app.client_role[]) as allowed
      from public.portal_approvals a
      where a.id = ${input.approvalId}::uuid
    `);
    return rows[0]?.allowed === true;
  });
  if (!decider) return NOT_FOUND;
  const comment = input.comment.trim();
  if (comment.length > MAX_APPROVAL_COMMENT) return { ok: false, rule: 'invalid_input' };
  if (input.decision === 'changes_requested' && comment === '') {
    return { ok: false, rule: 'comment_required' };
  }
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, input.approvalId))
      .for('update');
    if (!approval || !ROOM_SUBJECTS.includes(approval.subjectType)) return NOT_FOUND;
    if (approval.status !== 'pending') {
      return { ok: true as const, status: approval.status, decided: false };
    }
    await tx
      .update(approvals)
      .set({
        status: input.decision,
        decidedBy: claims.sub,
        decidedAt: now,
        comment: comment || null,
      })
      .where(eq(approvals.id, approval.id));
    if (approval.subjectType === 'project') {
      await decideProjectInTx(tx, approval, input.decision, comment, now);
    } else {
      await decidePhaseInTx(tx, approval, input.decision, claims.sub, deps, now);
    }
    await recordAudit(tx, {
      organizationId: approval.organizationId,
      action: 'approval.decided',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: approval.clientId,
      metadata: { decision: input.decision },
    });
    await emit(tx, {
      type: 'rooms.approval.decided',
      organizationId: approval.organizationId,
      clientId: approval.clientId,
      payload: { projectId: approval.projectId, approvalId: approval.id, decision: input.decision },
    });
    return { ok: true as const, status: input.decision as ApprovalStatus, decided: true };
  });

  if (!result.ok) return result;
  if (result.decided) await (deps.flush ?? requestFlush)();
  return { ok: true, status: result.status };
}

/** The team takes back a pending request; the phase returns to work. */
export async function withdrawApproval(
  claims: VerifiedClaims,
  input: { approvalId: string },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_state' }> {
  if (!z.uuid().safeParse(input.approvalId).success) return NOT_FOUND;
  const clientId = await deps.contexts.withUserContext(claims, async (tx) => {
    const [approval] = await tx
      .select({ clientId: approvals.clientId })
      .from(approvals)
      .where(eq(approvals.id, input.approvalId));
    return approval?.clientId ?? null;
  });
  const actor = clientId ? await roomActor(deps.contexts, claims, clientId, 'write') : null;
  if (!actor) return NOT_FOUND;

  return deps.contexts.withSystemContext(async (tx) => {
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, input.approvalId))
      .for('update');
    if (!approval || !ROOM_SUBJECTS.includes(approval.subjectType)) return NOT_FOUND;
    if (approval.status !== 'pending')
      return { ok: false as const, rule: 'invalid_state' as const };
    await tx.update(approvals).set({ status: 'withdrawn' }).where(eq(approvals.id, approval.id));
    await tx
      .update(projectPhases)
      .set({ status: 'in_progress' })
      .where(
        and(
          eq(projectPhases.id, approval.subjectId),
          eq(projectPhases.status, 'awaiting_approval'),
        ),
      );
    await recordAudit(tx, {
      organizationId: approval.organizationId,
      action: 'approval.withdrawn',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: approval.clientId,
      metadata: {},
    });
    return { ok: true as const };
  });
}
