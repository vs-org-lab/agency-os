import { eq, sql } from 'drizzle-orm';
import { schema, type ApprovalStatus } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import { soleClientManager } from '@/modules/rooms/server';
import type { VerifiedClaims } from '@/platform/db';
import {
  editableDocument,
  lockDocument,
  NOT_FOUND,
  uuid,
  type DocumentsDeps,
  type NotFound,
} from './access';
import { hasPendingApproval } from './lifecycle';

const { approvals, projectDocuments, projectDocumentVersions, tasks } = schema;

/** The task that leads the client's manager to revise a document the client sent back. */
export const REVIEW_DOCUMENT_TASK = 'Rever documento';

const MAX_COMMENT = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LISBON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });

/** Asks the client's decision maker to approve the current version of a shared document. */
export async function requestDocumentApproval(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentsDeps,
): Promise<{ ok: true; approvalId: string } | NotFound | { ok: false; rule: 'invalid_state' }> {
  const access = await editableDocument(claims, input.documentId, deps);
  if (!access) return NOT_FOUND;
  const { document, editor } = access;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const current = await lockDocument(tx, document.id);
    if (current?.status !== 'with_client' || !current.currentVersionId) return null;
    const versionId = current.currentVersionId;
    if (await hasPendingApproval(tx, document.id)) return null;
    const [approval] = await tx
      .insert(approvals)
      .values({
        organizationId: editor.organizationId,
        clientId: editor.clientId,
        projectId: editor.projectId,
        subjectType: 'document_version',
        subjectId: versionId,
        requestedBy: editor.actorId,
        requestedAt: now,
      })
      .returning({ id: approvals.id });
    if (!approval) throw new Error('Document approval was not requested');
    await recordAudit(tx, {
      organizationId: editor.organizationId,
      action: 'project_document.approval_requested',
      resourceType: 'approval',
      resourceId: approval.id,
      clientId: editor.clientId,
      metadata: { documentId: document.id, versionId },
    });
    await emit(tx, {
      type: 'rooms.approval.requested',
      organizationId: editor.organizationId,
      clientId: editor.clientId,
      payload: { projectId: editor.projectId, approvalId: approval.id },
    });
    return approval.id;
  });
  if (!result) return { ok: false, rule: 'invalid_state' };
  await (deps.flush ?? requestFlush)();
  return { ok: true, approvalId: result };
}

/**
 * The decision maker approves the requested version, or asks for changes with a comment (RN-41),
 * which opens "Rever documento" for the client's manager. A decision on a request already decided
 * returns its status and changes nothing.
 */
export async function decideDocumentApproval(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: 'approved' | 'changes_requested'; comment: string },
  deps: DocumentsDeps,
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
      where a.id = ${input.approvalId}::uuid and a.subject_type = 'document_version'
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
    const [document] = await tx
      .select({ id: projectDocuments.id, title: projectDocuments.title })
      .from(approvals)
      .innerJoin(projectDocumentVersions, eq(projectDocumentVersions.id, approvals.subjectId))
      .innerJoin(projectDocuments, eq(projectDocuments.id, projectDocumentVersions.documentId))
      .where(eq(approvals.id, input.approvalId));
    if (!document) return null;
    // The document first, then the approval: the same order as new versions, so the two never deadlock.
    await lockDocument(tx, document.id);
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, input.approvalId))
      .for('update');
    if (!approval || approval.subjectType !== 'document_version') return null;
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
        .update(projectDocuments)
        .set({
          status: 'approved',
          approvedAt: now,
          approvedVersionId: approval.subjectId,
          updatedAt: now,
        })
        .where(eq(projectDocuments.id, document.id));
    } else {
      await tx.insert(tasks).values({
        organizationId: approval.organizationId,
        clientId: approval.clientId,
        projectId: approval.projectId,
        title: REVIEW_DOCUMENT_TASK,
        notes: `${document.title}: ${comment}`,
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
      metadata: { decision: input.decision, documentId: document.id },
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
