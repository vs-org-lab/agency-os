import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type ProjectDocumentKind, type ProjectDocumentStatus } from '@agency-os/db';
import type { LibraryStorage } from '@/modules/library';
import { projectEditor } from '@/modules/rooms/server';
import type { DbContexts, VerifiedClaims } from '@/platform/db';

const { projectDocuments, projects } = schema;

export type DocumentsDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  storage: LibraryStorage;
  flush?: () => Promise<void>;
  now?: () => Date;
};

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

export const uuid = z.uuid();

export type DocumentEditor = {
  actorId: string;
  organizationId: string;
  clientId: string;
  projectId: string;
};

/**
 * The team member who edits a project's documents: the room writers and the freelancer assigned
 * to the project ("L E (próprio)" in the access matrix), in a project that is not cancelled.
 */
export async function documentEditor(
  claims: VerifiedClaims,
  projectId: string,
  deps: DocumentsDeps,
): Promise<DocumentEditor | null> {
  if (!uuid.safeParse(projectId).success || claims.user_kind === 'client') return null;
  const [project] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: projects.organizationId,
        clientId: projects.clientId,
        status: projects.status,
      })
      .from(projects)
      .where(eq(projects.id, projectId)),
  );
  if (!project || project.status === 'cancelled') return null;
  const editor = await projectEditor(deps.contexts, claims, project.clientId, projectId);
  if (!editor || editor.organizationId !== project.organizationId) return null;
  return {
    actorId: editor.userId,
    organizationId: project.organizationId,
    clientId: project.clientId,
    projectId,
  };
}

export type DocumentRecord = {
  id: string;
  organizationId: string;
  clientId: string;
  projectId: string;
  title: string;
  kind: ProjectDocumentKind;
  status: ProjectDocumentStatus;
  currentVersionId: string | null;
  approvedAt: Date | null;
};

export async function loadDocument(
  documentId: string,
  deps: DocumentsDeps,
): Promise<DocumentRecord | null> {
  if (!uuid.safeParse(documentId).success) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: projectDocuments.id,
        organizationId: projectDocuments.organizationId,
        clientId: projectDocuments.clientId,
        projectId: projectDocuments.projectId,
        title: projectDocuments.title,
        kind: projectDocuments.kind,
        status: projectDocuments.status,
        currentVersionId: projectDocuments.currentVersionId,
        approvedAt: projectDocuments.approvedAt,
      })
      .from(projectDocuments)
      .where(eq(projectDocuments.id, documentId)),
  );
  return row ?? null;
}

/** The document with its editor when the caller may edit it. */
export async function editableDocument(
  claims: VerifiedClaims,
  documentId: string,
  deps: DocumentsDeps,
): Promise<{ document: DocumentRecord; editor: DocumentEditor } | null> {
  const document = await loadDocument(documentId, deps);
  if (!document) return null;
  const editor = await documentEditor(claims, document.projectId, deps);
  return editor ? { document, editor } : null;
}
