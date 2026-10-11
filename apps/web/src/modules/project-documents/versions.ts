import { randomUUID } from 'node:crypto';
import { and, eq, lt, max } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { schema, type DbTransaction, type ProjectDocumentKind } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import {
  detectLibraryType,
  isSafeName,
  MAX_LIBRARY_BYTES,
  STALE_UPLOAD_MS,
} from '@/modules/library';
import { fitsStorage } from '@/modules/library/server';
import type { VerifiedClaims } from '@/platform/db';
import {
  documentEditor,
  editableDocument,
  lockDocument,
  NOT_FOUND,
  uuid,
  type DocumentEditor,
  type DocumentsDeps,
  type NotFound,
} from './access';
import { statusAfterNewVersion } from './domain/lifecycle';
import { withdrawPending } from './lifecycle';
import { documentLink } from './domain/links';
import { documentVersionPath } from './storage';

const { projectDocuments, projectDocumentVersions } = schema;

const titleSchema = z.string().trim().min(1).max(200);
const fileSchema = z.object({
  name: z.string().trim().min(1).max(200).refine(isSafeName),
  sizeBytes: z.number().int().min(1).max(MAX_LIBRARY_BYTES),
});

type InvalidInput = { ok: false; rule: 'invalid_input' };
type StorageFull = { ok: false; rule: 'storage_full' };
type NewVersion = { ok: true; versionId: string; uploadUrl: string | null };

type VersionContent =
  | { kind: 'figma' | 'link'; url: string }
  | { kind: 'pdf' | 'file'; file: { name: string; sizeBytes: number } };

function isLinkKind(kind: ProjectDocumentKind): kind is 'figma' | 'link' {
  return kind === 'figma' || kind === 'link';
}

/** The content of a new version for the document's kind, or null when it does not fit it. */
function versionContent(
  kind: ProjectDocumentKind,
  input: { url?: string; file?: { name: string; sizeBytes: number } },
): VersionContent | null {
  if (isLinkKind(kind)) {
    const url = input.url ? documentLink(kind, input.url) : null;
    return url ? { kind, url } : null;
  }
  const file = fileSchema.safeParse(input.file);
  return file.success ? { kind, file: file.data } : null;
}

/**
 * Makes a ready version the current one (RN-20), deciding on the locked document: an approved
 * document goes back to draft and keeps its approved version for the client; a shared document
 * shows the new version to the client and its pending approval request is withdrawn. A version
 * older than the current one, confirmed late, stays in history.
 */
export async function applyNewVersion(
  tx: DbTransaction,
  documentId: string,
  version: { id: string; number: number },
  now: Date,
): Promise<void> {
  const locked = await lockDocument(tx, documentId);
  if (!locked) return;
  if (locked.currentNumber !== null && version.number <= locked.currentNumber) return;
  const status = statusAfterNewVersion(locked.status);
  await tx
    .update(projectDocuments)
    .set({ currentVersionId: version.id, status, updatedAt: now })
    .where(eq(projectDocuments.id, documentId));
  if (status === 'with_client') {
    await tx
      .update(projectDocumentVersions)
      .set({ sharedAt: now })
      .where(eq(projectDocumentVersions.id, version.id));
    await withdrawPending(tx, documentId, now);
  }
}

/** Inserts a version; a link version is ready at once, a file version waits for its upload. */
async function insertVersion(
  tx: DbTransaction,
  editor: DocumentEditor,
  documentId: string,
  content: VersionContent,
): Promise<{ versionId: string; number: number; storagePath: string | null }> {
  const [latest] = await tx
    .select({ number: max(projectDocumentVersions.number) })
    .from(projectDocumentVersions)
    .where(eq(projectDocumentVersions.documentId, documentId));
  const versionId = randomUUID();
  const number = (latest?.number ?? 0) + 1;
  const storagePath =
    'file' in content ? documentVersionPath({ ...editor, documentId, versionId }) : null;
  await tx.insert(projectDocumentVersions).values({
    id: versionId,
    documentId,
    organizationId: editor.organizationId,
    clientId: editor.clientId,
    projectId: editor.projectId,
    number,
    kind: content.kind,
    url: 'url' in content ? content.url : null,
    storagePath,
    fileName: 'file' in content ? content.file.name : null,
    sizeBytes: 'file' in content ? content.file.sizeBytes : null,
    uploadStatus: 'file' in content ? 'uploading' : 'ready',
    createdBy: editor.actorId,
  });
  await recordAudit(tx, {
    organizationId: editor.organizationId,
    action: 'document.version_added',
    resourceType: 'project_document_version',
    resourceId: versionId,
    clientId: editor.clientId,
  });
  return { versionId, number, storagePath };
}

async function uploadLink(deps: DocumentsDeps, storagePath: string | null) {
  return storagePath ? deps.storage.createUploadUrl(storagePath) : null;
}

/**
 * A new document in draft (RF-031): Figma and external links start with a ready first version;
 * PDFs and files start with a version waiting for its upload, reserved against the organisation
 * storage ceiling.
 */
export async function createProjectDocument(
  claims: VerifiedClaims,
  input: {
    projectId: string;
    title: string;
    kind: ProjectDocumentKind;
    url?: string;
    file?: { name: string; sizeBytes: number };
  },
  deps: DocumentsDeps,
): Promise<({ documentId: string } & NewVersion) | NotFound | InvalidInput | StorageFull> {
  const editor = await documentEditor(claims, input.projectId, deps);
  if (!editor) return NOT_FOUND;
  const title = titleSchema.safeParse(input.title);
  const content = versionContent(input.kind, input);
  if (!title.success || !content) return { ok: false, rule: 'invalid_input' };
  const now = (deps.now ?? (() => new Date()))();

  const created = await deps.contexts.withSystemContext(async (tx) => {
    if (
      'file' in content &&
      !(await fitsStorage(tx, editor.organizationId, content.file.sizeBytes))
    ) {
      return null;
    }
    const documentId = randomUUID();
    await tx.insert(projectDocuments).values({
      id: documentId,
      organizationId: editor.organizationId,
      clientId: editor.clientId,
      projectId: editor.projectId,
      title: title.data,
      kind: input.kind,
      createdBy: editor.actorId,
    });
    await recordAudit(tx, {
      organizationId: editor.organizationId,
      action: 'project_document.created',
      resourceType: 'project_document',
      resourceId: documentId,
      clientId: editor.clientId,
      metadata: { kind: input.kind },
    });
    const version = await insertVersion(tx, editor, documentId, content);
    if (!version.storagePath) {
      await applyNewVersion(tx, documentId, { id: version.versionId, number: version.number }, now);
    }
    return { documentId, ...version };
  });
  if (!created) return { ok: false, rule: 'storage_full' };
  return {
    ok: true,
    documentId: created.documentId,
    versionId: created.versionId,
    uploadUrl: await uploadLink(deps, created.storagePath),
  };
}

/** RF-033: "Substituir" and "Mudar link" add a version; nothing already created changes. */
export async function addDocumentVersion(
  claims: VerifiedClaims,
  input: { documentId: string; url?: string; file?: { name: string; sizeBytes: number } },
  deps: DocumentsDeps,
): Promise<NewVersion | NotFound | InvalidInput | StorageFull> {
  const access = await editableDocument(claims, input.documentId, deps);
  if (!access) return NOT_FOUND;
  const { document, editor } = access;
  const content = versionContent(document.kind, input);
  if (!content) return { ok: false, rule: 'invalid_input' };
  const now = (deps.now ?? (() => new Date()))();

  const added = await deps.contexts.withSystemContext(async (tx) => {
    if (
      'file' in content &&
      !(await fitsStorage(tx, editor.organizationId, content.file.sizeBytes))
    ) {
      return null;
    }
    if (!(await lockDocument(tx, document.id))) return 'gone' as const;
    const version = await insertVersion(tx, editor, document.id, content);
    if (!version.storagePath) {
      await applyNewVersion(
        tx,
        document.id,
        { id: version.versionId, number: version.number },
        now,
      );
    }
    return version;
  });
  if (!added) return { ok: false, rule: 'storage_full' };
  if (added === 'gone') return NOT_FOUND;
  return {
    ok: true,
    versionId: added.versionId,
    uploadUrl: await uploadLink(deps, added.storagePath),
  };
}

async function pdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  } catch {
    return null;
  }
}

/**
 * Checks an uploaded version (SEC-30): the declared size, the real type and, for a PDF, that it
 * opens. A version that fails is removed and rejected; one that passes becomes current.
 */
export async function confirmDocumentVersion(
  claims: VerifiedClaims,
  input: { versionId: string },
  deps: DocumentsDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_file' }> {
  if (!uuid.safeParse(input.versionId).success) return NOT_FOUND;
  const [version] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        documentId: projectDocumentVersions.documentId,
        kind: projectDocumentVersions.kind,
        storagePath: projectDocumentVersions.storagePath,
        fileName: projectDocumentVersions.fileName,
        sizeBytes: projectDocumentVersions.sizeBytes,
        uploadStatus: projectDocumentVersions.uploadStatus,
      })
      .from(projectDocumentVersions)
      .where(eq(projectDocumentVersions.id, input.versionId)),
  );
  if (!version?.storagePath || version.uploadStatus !== 'uploading') return NOT_FOUND;
  const access = await editableDocument(claims, version.documentId, deps);
  if (!access) return NOT_FOUND;
  const { document, editor } = access;
  const storagePath = version.storagePath;

  const bytes = await deps.storage.download(storagePath);
  const detected =
    bytes && bytes.length === version.sizeBytes && bytes.length <= MAX_LIBRARY_BYTES
      ? detectLibraryType(bytes, version.fileName ?? '')
      : null;
  const pdf = detected?.mimeType === 'application/pdf';
  const pages = pdf && bytes ? await pdfPages(bytes) : null;
  const accepted =
    bytes && detected && (version.kind === 'file' ? !pdf || pages !== null : pdf && pages !== null);
  if (!accepted || !bytes || !detected) {
    const rejected = await deps.contexts.withSystemContext(async (tx) => {
      const updated = await tx
        .update(projectDocumentVersions)
        .set({ uploadStatus: 'rejected' })
        .where(
          and(
            eq(projectDocumentVersions.id, input.versionId),
            eq(projectDocumentVersions.uploadStatus, 'uploading'),
          ),
        )
        .returning({ id: projectDocumentVersions.id });
      if (updated.length === 0) return false;
      await recordAudit(tx, {
        organizationId: editor.organizationId,
        action: 'document.version_rejected',
        resourceType: 'project_document_version',
        resourceId: input.versionId,
        clientId: editor.clientId,
      });
      return true;
    });
    // Another confirmation or the sweep settled this version first; its file is not ours to remove.
    if (!rejected) return NOT_FOUND;
    await deps.storage.remove(storagePath);
    return { ok: false, rule: 'invalid_file' };
  }
  const now = (deps.now ?? (() => new Date()))();
  const ready = await deps.contexts.withSystemContext(async (tx) => {
    const [updated] = await tx
      .update(projectDocumentVersions)
      .set({ uploadStatus: 'ready', mimeType: detected.mimeType, sizeBytes: bytes.length, pages })
      .where(
        and(
          eq(projectDocumentVersions.id, input.versionId),
          eq(projectDocumentVersions.uploadStatus, 'uploading'),
        ),
      )
      .returning({ number: projectDocumentVersions.number });
    if (!updated) return false;
    await applyNewVersion(tx, document.id, { id: input.versionId, number: updated.number }, now);
    return true;
  });
  return ready ? { ok: true } : NOT_FOUND;
}

/**
 * Closes document uploads whose signed link has expired without a confirmation: the versions are
 * rejected and any bytes sent to them are removed, giving their reserved storage back.
 */
export async function sweepStaleDocumentUploads(deps: DocumentsDeps): Promise<{ removed: number }> {
  const cutoff = new Date((deps.now?.() ?? new Date()).getTime() - STALE_UPLOAD_MS);
  const stale = await deps.contexts.withSystemContext((tx) =>
    tx
      .update(projectDocumentVersions)
      .set({ uploadStatus: 'rejected' })
      .where(
        and(
          eq(projectDocumentVersions.uploadStatus, 'uploading'),
          lt(projectDocumentVersions.createdAt, cutoff),
        ),
      )
      .returning({ storagePath: projectDocumentVersions.storagePath }),
  );
  await deps.storage.removeMany(
    stale.flatMap((version) => (version.storagePath ? [version.storagePath] : [])),
  );
  return { removed: stale.length };
}
