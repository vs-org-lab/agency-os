import { eq, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const {
  clients,
  profiles,
  projectDocumentComments,
  projectDocumentVersions,
  projectDocuments,
  projects,
} = schema;

export type DocumentNoticeDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  appBaseUrl: string;
};

export type DocumentCommentNotice = {
  /** Client comments reach the client team; team comments reach the client (RN-23). */
  audience: 'team' | 'client';
  organizationId: string;
  clientId: string;
  documentId: string;
  params: { companyName: string; documentTitle: string; roomUrl: string };
};

/**
 * Who hears about a comment, or null when nobody does: internal comments never leave, and a team
 * comment reaches the client only on a version the client was shown.
 */
export async function documentCommentNotice(
  commentId: string,
  deps: DocumentNoticeDeps,
): Promise<DocumentCommentNotice | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        organizationId: projectDocumentComments.organizationId,
        clientId: projectDocumentComments.clientId,
        documentId: projectDocumentComments.documentId,
        internal: projectDocumentComments.internal,
        authorKind: profiles.kind,
        documentTitle: projectDocuments.title,
        companyName: clients.name,
        // The same rule as the portal views, without the membership check.
        clientSees: sql<boolean>`(
          ${projectDocumentVersions.sharedAt} is not null
          and ${projectDocumentVersions.uploadStatus} = 'ready'
          and (${projectDocuments.status} in ('with_client', 'approved')
               or ${projectDocuments.approvedAt} is not null)
          and ${projects.status} <> 'cancelled'
        )`,
      })
      .from(projectDocumentComments)
      .innerJoin(
        projectDocumentVersions,
        eq(projectDocumentVersions.id, projectDocumentComments.versionId),
      )
      .innerJoin(projectDocuments, eq(projectDocuments.id, projectDocumentComments.documentId))
      .innerJoin(projects, eq(projects.id, projectDocuments.projectId))
      .innerJoin(clients, eq(clients.id, projectDocumentComments.clientId))
      .leftJoin(profiles, eq(profiles.id, projectDocumentComments.authorId))
      .where(eq(projectDocumentComments.id, commentId));
    if (!row || row.internal) return null;
    const audience = row.authorKind === 'client' ? 'team' : 'client';
    if (audience === 'client' && !row.clientSees) return null;
    return {
      audience,
      organizationId: row.organizationId,
      clientId: row.clientId,
      documentId: row.documentId,
      params: {
        companyName: row.companyName,
        documentTitle: row.documentTitle,
        roomUrl: new URL(`/c/${row.clientId}/docs/${row.documentId}`, deps.appBaseUrl).toString(),
      },
    };
  });
}
