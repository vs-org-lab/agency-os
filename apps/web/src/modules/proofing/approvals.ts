import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ApprovalStatus, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import { roomActor } from '@/modules/rooms/server';
import type { VerifiedClaims } from '@/platform/db';
import { roundsStatus, type RoundsStatus } from './domain/rounds';
import type { ProofingDeps } from './files';

const {
  approvals,
  clientStaffAssignments,
  organizationMemberships,
  projects,
  proofVersions,
  tasks,
} = schema;

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
const uuid = z.uuid();
const MAX_COMMENT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** RN-42: the task that leads the team to quote an extra round. */
export const EXTRA_ROUND_TASK = 'Orçamentar ronda extra';

type Deps = ProofingDeps & { flush?: () => Promise<void> };

/**
 * Pending requests on the file's older versions are withdrawn: the client decides the latest. A
 * slow upload confirmed after a newer version leaves that newer request alone.
 */
export async function withdrawOlderRequests(
  tx: DbTransaction,
  fileId: string,
  currentVersionId: string,
): Promise<void> {
  await tx.execute(sql`
    update public.approvals a set status = 'withdrawn'
    from public.proof_versions v, public.proof_versions current_version
    where a.subject_type = 'file_version' and a.subject_id = v.id and a.status = 'pending'
      and current_version.id = ${currentVersionId}::uuid
      and v.file_id = ${fileId}::uuid and v.number < current_version.number
  `);
}

/** "Pedir aprovação" of the latest ready version of a file. */
export async function requestVersionApproval(
  claims: VerifiedClaims,
  input: { versionId: string },
  deps: Deps,
): Promise<{ ok: true; approvalId: string } | NotFound | { ok: false; rule: 'invalid_state' }> {
  if (!uuid.safeParse(input.versionId).success) return NOT_FOUND;
  const [version] = await deps.contexts.withSystemContext((tx) =>
    tx.select().from(proofVersions).where(eq(proofVersions.id, input.versionId)),
  );
  if (!version) return NOT_FOUND;
  const actor = await roomActor(deps.contexts, claims, version.clientId, 'write');
  if (!actor || actor.organizationId !== version.organizationId) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [latest] = await tx
      .select({ id: proofVersions.id })
      .from(proofVersions)
      .where(and(eq(proofVersions.fileId, version.fileId), eq(proofVersions.status, 'ready')))
      .orderBy(desc(proofVersions.number))
      .limit(1);
    if (version.status !== 'ready' || latest?.id !== version.id) {
      return { ok: false as const, rule: 'invalid_state' as const };
    }
    const [pending] = await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, 'file_version'),
          eq(approvals.subjectId, version.id),
          eq(approvals.status, 'pending'),
        ),
      );
    if (pending) return { ok: true as const, approvalId: pending.id };
    await withdrawOlderRequests(tx, version.fileId, version.id);
    const [approval] = await tx
      .insert(approvals)
      .values({
        organizationId: version.organizationId,
        clientId: version.clientId,
        projectId: version.projectId,
        subjectType: 'file_version',
        subjectId: version.id,
        requestedBy: actor.userId,
        requestedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error('Approval was not requested');
    await recordAudit(tx, {
      organizationId: version.organizationId,
      action: 'approval.requested',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: version.clientId,
      metadata: { subject: 'file_version', subjectId: version.id },
    });
    await emit(tx, {
      type: 'rooms.approval.requested',
      organizationId: version.organizationId,
      clientId: version.clientId,
      payload: { projectId: version.projectId, approvalId: approval.id },
    });
    return { ok: true as const, approvalId: approval.id };
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

async function usedRounds(tx: DbTransaction, projectId: string): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(approvals)
    .where(
      and(
        eq(approvals.projectId, projectId),
        eq(approvals.subjectType, 'file_version'),
        eq(approvals.status, 'changes_requested'),
      ),
    );
  return Number(row?.total ?? 0);
}

/** The client's single assigned manager, who quotes the extra round; null when there is none or several. */
async function soleManager(tx: DbTransaction, clientId: string): Promise<string | null> {
  const rows = await tx
    .select({ userId: clientStaffAssignments.userId })
    .from(clientStaffAssignments)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, clientStaffAssignments.userId),
        eq(organizationMemberships.organizationId, clientStaffAssignments.organizationId),
      ),
    )
    .where(
      and(
        eq(clientStaffAssignments.clientId, clientId),
        sql`${clientStaffAssignments.archivedAt} is null`,
        eq(organizationMemberships.role, 'project_manager'),
        eq(organizationMemberships.status, 'active'),
      ),
    );
  return rows.length === 1 ? (rows[0]?.userId ?? null) : null;
}

/**
 * The decision maker approves a file version or asks for changes with a comment (RN-41). Each
 * change request counts a round of the project (RF-073); the warning at 80% goes once per limit
 * (AUT-17), and a round past the limit is marked extra and opens the quoting task (RN-42).
 */
export async function decideFileApproval(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: 'approved' | 'changes_requested'; comment: string },
  deps: Deps,
): Promise<
  | { ok: true; status: ApprovalStatus; rounds: RoundsStatus }
  | { ok: false; rule: 'not_found' | 'comment_required' | 'invalid_input' }
> {
  if (!uuid.safeParse(input.approvalId).success) return NOT_FOUND;
  if (input.decision !== 'approved' && input.decision !== 'changes_requested') {
    return { ok: false, rule: 'invalid_input' };
  }
  const decider = await deps.contexts.withUserContext(claims, async (tx) => {
    const rows = await tx.execute<{ allowed: boolean }>(sql`
      select app.is_client_member(a.client_id, array['decision_maker']::app.client_role[]) as allowed
      from public.portal_approvals a
      where a.id = ${input.approvalId}::uuid and a.subject_type = 'file_version'
    `);
    return rows[0]?.allowed === true;
  });
  if (!decider) return NOT_FOUND;
  const comment = input.comment.trim();
  if (comment.length > MAX_COMMENT) return { ok: false, rule: 'invalid_input' };
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
    if (!approval || approval.subjectType !== 'file_version') return NOT_FOUND;
    const [project] = await tx
      .select({ limit: projects.revisionLimit, warnedLimit: projects.roundsWarnedLimit })
      .from(projects)
      .where(eq(projects.id, approval.projectId))
      .for('update');
    if (!project) return NOT_FOUND;
    if (approval.status !== 'pending') {
      return {
        ok: true as const,
        status: approval.status,
        rounds: roundsStatus(await usedRounds(tx, approval.projectId), project.limit),
        decided: false,
      };
    }
    const requestsChanges = input.decision === 'changes_requested';
    const used = (await usedRounds(tx, approval.projectId)) + (requestsChanges ? 1 : 0);
    const rounds = roundsStatus(used, project.limit);
    const extra = requestsChanges && rounds.extra;
    await tx
      .update(approvals)
      .set({
        status: input.decision,
        decidedBy: claims.sub,
        decidedAt: now,
        comment: comment || null,
        extraRound: extra,
      })
      .where(eq(approvals.id, approval.id));
    await recordAudit(tx, {
      organizationId: approval.organizationId,
      action: 'approval.decided',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: approval.clientId,
      metadata: { decision: input.decision, rounds: used, extra },
    });
    await emit(tx, {
      type: 'rooms.approval.decided',
      organizationId: approval.organizationId,
      clientId: approval.clientId,
      payload: { projectId: approval.projectId, approvalId: approval.id, decision: input.decision },
    });
    if (requestsChanges && rounds.warning && project.warnedLimit !== project.limit) {
      await tx
        .update(projects)
        .set({ roundsWarnedLimit: project.limit })
        .where(eq(projects.id, approval.projectId));
      await emit(tx, {
        type: 'proofing.rounds.warning',
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        payload: { projectId: approval.projectId, used, limit: project.limit },
      });
    }
    if (extra) {
      await tx.insert(tasks).values({
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        projectId: approval.projectId,
        title: EXTRA_ROUND_TASK,
        assigneeId: await soleManager(tx, approval.clientId),
        dueOn: LISBON_DATE.format(new Date(now.getTime() + 2 * DAY_MS)),
      });
      await emit(tx, {
        type: 'proofing.round.extra',
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        payload: {
          projectId: approval.projectId,
          approvalId: approval.id,
          used,
          limit: project.limit,
        },
      });
    }
    return { ok: true as const, status: input.decision as ApprovalStatus, rounds, decided: true };
  });

  if (!result.ok) return result;
  if (result.decided) await (deps.flush ?? requestFlush)();
  return { ok: true, status: result.status, rounds: result.rounds };
}

/** The project's revision limit (RF-073), set by the founder or the client's manager. */
export async function setRevisionLimit(
  claims: VerifiedClaims,
  input: { projectId: string; limit: number },
  deps: ProofingDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_input' }> {
  if (!uuid.safeParse(input.projectId).success) return NOT_FOUND;
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) {
    return { ok: false, rule: 'invalid_input' };
  }
  const [project] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: projects.clientId, organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, input.projectId)),
  );
  if (!project) return NOT_FOUND;
  const actor = await roomActor(deps.contexts, claims, project.clientId, 'write');
  if (!actor || actor.organizationId !== project.organizationId) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .update(projects)
      .set({ revisionLimit: input.limit })
      .where(eq(projects.id, input.projectId));
    await recordAudit(tx, {
      organizationId: project.organizationId,
      action: 'project.revision_limit_set',
      resourceType: 'project',
      resourceId: input.projectId,
      clientId: project.clientId,
      metadata: { limit: input.limit },
    });
  });
  return { ok: true };
}
