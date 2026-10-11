import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { schema, type ApprovalStatus } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import { soleClientManager } from '@/modules/rooms/server';
import type { VerifiedClaims } from '@/platform/db';
import {
  editableHub,
  INVALID_STATE,
  lockHub,
  NOT_FOUND,
  uuid,
  type BrandHubDeps,
  type NotFound,
} from './access';

const { approvals, brandHubs, projects, tasks } = schema;

/** The task that leads the client's manager to revise the hub the client sent back. */
export const REVIEW_HUB_TASK = 'Rever Brand Hub';

const MAX_COMMENT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/**
 * Asks the client's decision maker to approve the current publication. Approvals belong to a
 * project, so the request sits on the client's most recent project that is not cancelled.
 */
export async function requestHubApproval(
  claims: VerifiedClaims,
  input: { hubId: string },
  deps: BrandHubDeps,
): Promise<{ ok: true; approvalId: string } | NotFound | typeof INVALID_STATE> {
  const access = await editableHub(claims, { kind: 'hub', id: input.hubId }, deps);
  if (!access?.editor.canPublish) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const approvalId = await deps.contexts.withSystemContext(async (tx) => {
    const hub = await lockHub(tx, access.hubId);
    const publicationId = hub?.publishedPublicationId;
    if (!hub || !publicationId || hub.approvedPublicationId === publicationId) return null;
    const [pending] = await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, 'brand_hub_publication'),
          eq(approvals.subjectId, publicationId),
          eq(approvals.status, 'pending'),
        ),
      );
    if (pending) return null;
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.clientId, hub.clientId), ne(projects.status, 'cancelled')))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    if (!project) return null;
    const [approval] = await tx
      .insert(approvals)
      .values({
        organizationId: hub.organizationId,
        clientId: hub.clientId,
        projectId: project.id,
        subjectType: 'brand_hub_publication',
        subjectId: publicationId,
        requestedBy: access.editor.actorId,
        requestedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error('Brand hub approval was not requested');
    await recordAudit(tx, {
      organizationId: hub.organizationId,
      action: 'brand_hub.approval_requested',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: hub.clientId,
      metadata: { hubId: hub.id, publicationId },
    });
    await emit(tx, {
      type: 'rooms.approval.requested',
      organizationId: hub.organizationId,
      clientId: hub.clientId,
      payload: { projectId: project.id, approvalId: approval.id },
    });
    return approval.id;
  });
  if (!approvalId) return INVALID_STATE;
  await (deps.flush ?? requestFlush)();
  return { ok: true, approvalId };
}

/**
 * The decision maker approves the publication, or asks for changes with a comment (RN-41), which
 * opens "Rever Brand Hub" for the client's manager. A decision on a request already decided returns
 * its status and changes nothing.
 */
export async function decideHubApproval(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: 'approved' | 'changes_requested'; comment: string },
  deps: BrandHubDeps,
): Promise<
  | { ok: true; status: ApprovalStatus }
  | NotFound
  | { ok: false; rule: 'comment_required' | 'invalid_input' }
> {
  if (!uuid.safeParse(input.approvalId).success) return NOT_FOUND;
  if (input.decision !== 'approved' && input.decision !== 'changes_requested') {
    return { ok: false, rule: 'invalid_input' };
  }
  const decider = await deps.contexts.withUserContext(claims, async (tx) => {
    const rows = await tx.execute<{ allowed: boolean }>(sql`
      select app.is_client_member(a.client_id, array['decision_maker']::app.client_role[]) as allowed
      from public.portal_approvals a
      where a.id = ${input.approvalId}::uuid and a.subject_type = 'brand_hub_publication'
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
    const [subject] = await tx
      .select({ hubId: brandHubs.id })
      .from(approvals)
      .innerJoin(brandHubs, eq(brandHubs.clientId, approvals.clientId))
      .where(eq(approvals.id, input.approvalId));
    if (!subject) return null;
    // The hub first, then the approval: the same order as publishing, so the two never deadlock.
    await lockHub(tx, subject.hubId);
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, input.approvalId))
      .for('update');
    if (!approval || approval.subjectType !== 'brand_hub_publication') return null;
    if (approval.status !== 'pending') return { status: approval.status, decided: false };
    await tx
      .update(approvals)
      .set({
        status: input.decision,
        decidedBy: claims.sub,
        decidedAt: now,
        comment: comment || null,
      })
      .where(eq(approvals.id, approval.id));
    if (input.decision === 'approved') {
      await tx
        .update(brandHubs)
        .set({ approvedPublicationId: approval.subjectId, updatedAt: now })
        .where(eq(brandHubs.id, subject.hubId));
    } else {
      await tx.insert(tasks).values({
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        projectId: approval.projectId,
        title: REVIEW_HUB_TASK,
        notes: comment,
        assigneeId: await soleClientManager(tx, approval.clientId),
        dueOn: LISBON_DATE.format(new Date(now.getTime() + 2 * DAY_MS)),
      });
    }
    await recordAudit(tx, {
      organizationId: approval.organizationId,
      action: 'approval.decided',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: approval.clientId,
      metadata: { decision: input.decision, publicationId: approval.subjectId },
    });
    await emit(tx, {
      type: 'rooms.approval.decided',
      organizationId: approval.organizationId,
      clientId: approval.clientId,
      payload: { projectId: approval.projectId, approvalId: approval.id, decision: input.decision },
    });
    return { status: input.decision as ApprovalStatus, decided: true };
  });
  if (!result) return NOT_FOUND;
  if (result.decided) await (deps.flush ?? requestFlush)();
  return { ok: true, status: result.status };
}
