import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import {
  documentEditor,
  loadDocument,
  NOT_FOUND,
  type DocumentRecord,
  type DocumentsDeps,
  type NotFound,
} from './access';

const { projectDocumentComments } = schema;

const bodySchema = z.string().trim().min(1).max(2000);

/**
 * The version a comment belongs to: the current version for the team, the latest version shown to
 * the client for the client's decision maker and operational users. Null when the caller may not
 * comment.
 */
async function commentTarget(
  claims: VerifiedClaims,
  documentId: string,
  deps: DocumentsDeps,
): Promise<{ document: DocumentRecord; versionId: string; role: 'team' | 'client' } | null> {
  const document = await loadDocument(documentId, deps);
  if (!document) return null;
  if (claims.user_kind !== 'client') {
    const editor = await documentEditor(claims, document.projectId, deps);
    return editor && document.currentVersionId
      ? { document, versionId: document.currentVersionId, role: 'team' }
      : null;
  }
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ id: string }>(sql`
      select v.id from public.portal_project_document_versions v
      where v.document_id = ${documentId}::uuid
      order by v.number desc
      limit 1
    `),
  );
  return rows[0] ? { document, versionId: rows[0].id, role: 'client' } : null;
}

/** RF-034: a comment on a document; the team may keep one internal, which never leaves (RN-23). */
export async function addDocumentComment(
  claims: VerifiedClaims,
  input: { documentId: string; body: string; internal?: boolean },
  deps: DocumentsDeps,
): Promise<{ ok: true; commentId: string } | NotFound | { ok: false; rule: 'invalid_input' }> {
  const target = await commentTarget(claims, input.documentId, deps);
  if (!target) return NOT_FOUND;
  const body = bodySchema.safeParse(input.body);
  const internal = input.internal === true;
  if (!body.success || (internal && target.role === 'client')) {
    return { ok: false, rule: 'invalid_input' };
  }
  const { document } = target;
  const commentId = await deps.contexts.withSystemContext(async (tx) => {
    const [comment] = await tx
      .insert(projectDocumentComments)
      .values({
        documentId: document.id,
        versionId: target.versionId,
        organizationId: document.organizationId,
        clientId: document.clientId,
        projectId: document.projectId,
        authorId: claims.sub,
        body: body.data,
        internal,
      })
      .returning({ id: projectDocumentComments.id });
    if (!comment) throw new Error('Document comment was not saved');
    await recordAudit(tx, {
      organizationId: document.organizationId,
      action: 'project_document.commented',
      resourceType: 'project_document_comment',
      resourceId: comment.id,
      clientId: document.clientId,
      metadata: { internal },
    });
    if (!internal) {
      await emit(tx, {
        type: 'rooms.document.commented',
        organizationId: document.organizationId,
        clientId: document.clientId,
        payload: { documentId: document.id, commentId: comment.id },
      });
    }
    return comment.id;
  });
  if (!internal) await (deps.flush ?? requestFlush)();
  return { ok: true, commentId };
}
