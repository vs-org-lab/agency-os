import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { clients, profiles, proofComments, proofFiles, proofVersions } = schema;

export type ProofNoticeDeps = {
  contexts: Pick<DbContexts, 'withSystemContext'>;
  appBaseUrl: string;
};

export type ProofCommentNotice = {
  /** Client comments reach the client team; team comments reach the client unless internal. */
  audience: 'team' | 'client';
  clientId: string;
  organizationId: string;
  params: { companyName: string; fileTitle: string; roomUrl: string };
};

export async function proofCommentNotice(
  commentId: string,
  deps: ProofNoticeDeps,
): Promise<ProofCommentNotice | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        organizationId: proofComments.organizationId,
        clientId: proofComments.clientId,
        versionId: proofComments.versionId,
        internal: proofComments.internal,
        authorKind: profiles.kind,
        fileTitle: proofFiles.title,
        companyName: clients.name,
      })
      .from(proofComments)
      .innerJoin(proofVersions, eq(proofVersions.id, proofComments.versionId))
      .innerJoin(proofFiles, eq(proofFiles.id, proofVersions.fileId))
      .innerJoin(clients, eq(clients.id, proofComments.clientId))
      .leftJoin(profiles, eq(profiles.id, proofComments.authorId))
      .where(eq(proofComments.id, commentId));
    if (!row || row.internal) return null;
    return {
      audience: row.authorKind === 'client' ? 'team' : 'client',
      clientId: row.clientId,
      organizationId: row.organizationId,
      params: {
        companyName: row.companyName,
        fileTitle: row.fileTitle,
        roomUrl: new URL(`/c/${row.clientId}/proofs/${row.versionId}`, deps.appBaseUrl).toString(),
      },
    };
  });
}

/** The company name and room link for the rounds and extra round alerts. */
export async function roundsNoticeParams(
  clientId: string,
  deps: ProofNoticeDeps,
): Promise<{ companyName: string; roomUrl: string } | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [client] = await tx
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, clientId));
    return client
      ? { companyName: client.name, roomUrl: new URL(`/c/${clientId}`, deps.appBaseUrl).toString() }
      : null;
  });
}
