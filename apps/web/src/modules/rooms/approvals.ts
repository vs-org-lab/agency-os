import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ApprovalStatus } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { roomActor } from './authorize';
import { completePhaseInTx } from './process';
import type { RoomsDeps } from './runtime-types';

const { approvals, projectPhases, projectSteps, projectUpdates } = schema;

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

export type ApprovalDecision = 'approved' | 'changes_requested';

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
    if (!approval || approval.subjectType !== 'phase') return NOT_FOUND;
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
    const [phase] = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.id, approval.subjectId))
      .for('update');
    if (!phase) throw new Error('Approved phase was not found');

    if (input.decision === 'approved') {
      const completed = await completePhaseInTx(tx, phase, deps, now);
      if (!completed.ok) throw new Error(`Approved phase could not complete: ${completed.rule}`);
    } else {
      await tx
        .update(projectPhases)
        .set({ status: 'in_progress' })
        .where(eq(projectPhases.id, phase.id));
      await tx.insert(projectUpdates).values({
        organizationId: phase.organizationId,
        clientId: phase.clientId,
        projectId: phase.projectId,
        authorId: claims.sub,
        kind: 'approval_decided',
        body: phase.name,
        visibility: 'client',
      });
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
    if (!approval) return NOT_FOUND;
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
