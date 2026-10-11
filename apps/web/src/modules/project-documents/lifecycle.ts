import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { editableDocument, NOT_FOUND, type DocumentsDeps, type NotFound } from './access';
import { documentActions } from './domain/lifecycle';

const { approvals, projectDocuments, projectDocumentVersions } = schema;

type InvalidState = { ok: false; rule: 'invalid_state' };
const INVALID_STATE: InvalidState = { ok: false, rule: 'invalid_state' };

/** Whether a version of the document has a pending approval request. */
export async function hasPendingApproval(tx: DbTransaction, documentId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: approvals.id })
    .from(approvals)
    .innerJoin(projectDocumentVersions, eq(projectDocumentVersions.id, approvals.subjectId))
    .where(
      and(
        eq(approvals.subjectType, 'document_version'),
        eq(approvals.status, 'pending'),
        eq(projectDocumentVersions.documentId, documentId),
      ),
    );
  return rows.length > 0;
}

/** Withdraws pending approval requests on any version of the document. */
export async function withdrawPending(
  tx: DbTransaction,
  documentId: string,
  now: Date,
): Promise<void> {
  const versions = tx
    .select({ id: projectDocumentVersions.id })
    .from(projectDocumentVersions)
    .where(eq(projectDocumentVersions.documentId, documentId));
  await tx
    .update(approvals)
    .set({ status: 'withdrawn', decidedAt: now })
    .where(
      and(
        eq(approvals.subjectType, 'document_version'),
        eq(approvals.status, 'pending'),
        inArray(approvals.subjectId, versions),
      ),
    );
}

/** Shares a draft whose current version is ready: the client sees it and is told (RF-030). */
export async function shareProjectDocument(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentsDeps,
): Promise<{ ok: true } | NotFound | InvalidState> {
  const access = await editableDocument(claims, input.documentId, deps);
  if (!access) return NOT_FOUND;
  const { document, editor } = access;
  const now = (deps.now ?? (() => new Date()))();
  const shared = await deps.contexts.withSystemContext(async (tx) => {
    const [current] = await tx
      .update(projectDocuments)
      .set({ status: 'with_client', sharedAt: now, updatedAt: now })
      .where(
        and(
          eq(projectDocuments.id, document.id),
          eq(projectDocuments.status, 'draft'),
          isNotNull(projectDocuments.currentVersionId),
        ),
      )
      .returning({ versionId: projectDocuments.currentVersionId });
    if (!current?.versionId) return false;
    await tx
      .update(projectDocumentVersions)
      .set({ sharedAt: now })
      .where(eq(projectDocumentVersions.id, current.versionId));
    await recordAudit(tx, {
      organizationId: editor.organizationId,
      action: 'project_document.shared',
      resourceType: 'project_document',
      resourceId: document.id,
      clientId: editor.clientId,
    });
    await emit(tx, {
      type: 'rooms.document.shared',
      organizationId: editor.organizationId,
      clientId: editor.clientId,
      payload: { documentId: document.id },
    });
    return true;
  });
  if (!shared) return INVALID_STATE;
  await (deps.flush ?? requestFlush)();
  return { ok: true };
}

/** RN-21: back to draft only before the approval; a pending request is withdrawn. */
export async function withdrawProjectDocument(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentsDeps,
): Promise<{ ok: true } | NotFound | InvalidState> {
  const access = await editableDocument(claims, input.documentId, deps);
  if (!access) return NOT_FOUND;
  const { document, editor } = access;
  const now = (deps.now ?? (() => new Date()))();
  const withdrawn = await deps.contexts.withSystemContext(async (tx) => {
    const updated = await tx
      .update(projectDocuments)
      .set({ status: 'draft', updatedAt: now })
      .where(and(eq(projectDocuments.id, document.id), eq(projectDocuments.status, 'with_client')))
      .returning({ id: projectDocuments.id });
    if (updated.length === 0) return false;
    await withdrawPending(tx, document.id, now);
    await recordAudit(tx, {
      organizationId: editor.organizationId,
      action: 'project_document.withdrawn',
      resourceType: 'project_document',
      resourceId: document.id,
      clientId: editor.clientId,
    });
    return true;
  });
  return withdrawn ? { ok: true } : INVALID_STATE;
}

/** RN-20: a document that was ever approved is kept; any other is deleted with its files. */
export async function removeProjectDocument(
  claims: VerifiedClaims,
  input: { documentId: string },
  deps: DocumentsDeps,
): Promise<{ ok: true } | NotFound | InvalidState> {
  const access = await editableDocument(claims, input.documentId, deps);
  if (!access) return NOT_FOUND;
  const { document, editor } = access;
  if (
    !documentActions({
      status: document.status,
      everApproved: document.approvedAt !== null,
      pendingApproval: false,
    }).remove
  ) {
    return INVALID_STATE;
  }
  const paths = await deps.contexts.withSystemContext(async (tx) => {
    const versions = await tx
      .select({ storagePath: projectDocumentVersions.storagePath })
      .from(projectDocumentVersions)
      .where(eq(projectDocumentVersions.documentId, document.id));
    await withdrawPending(tx, document.id, (deps.now ?? (() => new Date()))());
    await tx.delete(projectDocuments).where(eq(projectDocuments.id, document.id));
    await recordAudit(tx, {
      organizationId: editor.organizationId,
      action: 'project_document.removed',
      resourceType: 'project_document',
      resourceId: document.id,
      clientId: editor.clientId,
      metadata: { title: document.title },
    });
    return versions.flatMap((version) => (version.storagePath ? [version.storagePath] : []));
  });
  await deps.storage.removeMany(paths);
  return { ok: true };
}
