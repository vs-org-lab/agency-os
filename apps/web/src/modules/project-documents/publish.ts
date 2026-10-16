import { randomUUID } from 'node:crypto';
import { and, eq, max } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import {
  documentEditor,
  lockDocument,
  NOT_FOUND,
  type DocumentsDeps,
  type NotFound,
} from './access';
import { documentVersionPath } from './storage';
import { applyNewVersion } from './versions';

const { projectDocuments, projectDocumentVersions } = schema;

export type GeneratedPdf = {
  projectId: string;
  /**
   * The document's id, chosen by the caller and the same on every publication of the same content
   * (a report's id): the first publication creates it, so concurrent ones meet on one document.
   */
  documentId: string;
  title: string;
  fileName: string;
  bytes: Uint8Array;
};

/**
 * Publishes a PDF the OS generated (a client report) as a room document with the client: the
 * first publication creates the document, later ones add a version. The client is told as for a
 * document shared by hand (RF-030).
 */
export async function publishGeneratedPdf(
  claims: VerifiedClaims,
  input: GeneratedPdf,
  deps: DocumentsDeps,
): Promise<{ ok: true; documentId: string; versionId: string } | NotFound> {
  const editor = await documentEditor(claims, input.projectId, deps);
  if (!editor) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  const pages = (await PDFDocument.load(input.bytes)).getPageCount();

  const { documentId } = input;
  const versionId = randomUUID();
  const storagePath = documentVersionPath({ ...editor, documentId, versionId });
  await deps.storage.upload(storagePath, input.bytes, 'application/pdf');

  const published = await deps.contexts
    .withSystemContext(async (tx) => {
      const created = await tx
        .insert(projectDocuments)
        .values({
          id: documentId,
          organizationId: editor.organizationId,
          clientId: editor.clientId,
          projectId: editor.projectId,
          title: input.title,
          kind: 'pdf',
          createdBy: editor.actorId,
        })
        .onConflictDoNothing()
        .returning({ id: projectDocuments.id });
      if (created.length > 0) {
        await recordAudit(tx, {
          organizationId: editor.organizationId,
          action: 'project_document.created',
          resourceType: 'project_document',
          resourceId: documentId,
          clientId: editor.clientId,
          metadata: { kind: 'pdf', generated: true },
        });
      }
      await lockDocument(tx, documentId);
      const [owner] = await tx
        .select({ projectId: projectDocuments.projectId, kind: projectDocuments.kind })
        .from(projectDocuments)
        .where(eq(projectDocuments.id, documentId));
      if (owner?.projectId !== editor.projectId || owner.kind !== 'pdf') return false;
      const [latest] = await tx
        .select({ number: max(projectDocumentVersions.number) })
        .from(projectDocumentVersions)
        .where(eq(projectDocumentVersions.documentId, documentId));
      const number = (latest?.number ?? 0) + 1;
      await tx.insert(projectDocumentVersions).values({
        id: versionId,
        documentId,
        organizationId: editor.organizationId,
        clientId: editor.clientId,
        projectId: editor.projectId,
        number,
        kind: 'pdf',
        storagePath,
        fileName: input.fileName,
        mimeType: 'application/pdf',
        sizeBytes: input.bytes.length,
        pages,
        uploadStatus: 'ready',
        createdBy: editor.actorId,
      });
      await applyNewVersion(tx, documentId, { id: versionId, number }, now);
      // A new or approved document is back in draft after the version: it goes to the client now.
      const shared = await tx
        .update(projectDocuments)
        .set({ status: 'with_client', sharedAt: now, updatedAt: now })
        .where(and(eq(projectDocuments.id, documentId), eq(projectDocuments.status, 'draft')))
        .returning({ id: projectDocuments.id });
      if (shared.length > 0) {
        await tx
          .update(projectDocumentVersions)
          .set({ sharedAt: now })
          .where(eq(projectDocumentVersions.id, versionId));
      }
      await recordAudit(tx, {
        organizationId: editor.organizationId,
        action: 'project_document.shared',
        resourceType: 'project_document',
        resourceId: documentId,
        clientId: editor.clientId,
        metadata: { versionId, generated: true },
      });
      await emit(tx, {
        type: 'rooms.document.shared',
        organizationId: editor.organizationId,
        clientId: editor.clientId,
        payload: { documentId },
      });
      return true;
    })
    .catch(async (error: unknown) => {
      // A version that never committed must not leave its file behind.
      await deps.storage.remove(storagePath);
      throw error;
    });
  if (!published) {
    await deps.storage.remove(storagePath);
    return NOT_FOUND;
  }
  await (deps.flush ?? requestFlush)();
  return { ok: true, documentId, versionId };
}
