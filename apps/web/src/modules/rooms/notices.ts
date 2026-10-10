import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { approvals, clients, projectPhases, proofFiles, proofVersions } = schema;

export type ApprovalNotice = {
  companyName: string;
  /** The phase name or, for a file approval, the file title. */
  phaseName: string;
  subject: 'phase' | 'file';
  decision: 'approved' | 'changes_requested';
  roomUrl: string;
};

/** The client, the phase or file and the room link that approval alerts to the team mention. */
export async function approvalNotice(
  approvalId: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; appBaseUrl: string },
): Promise<ApprovalNotice | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        clientId: approvals.clientId,
        status: approvals.status,
        subjectType: approvals.subjectType,
        subjectId: approvals.subjectId,
        companyName: clients.name,
        phaseName: projectPhases.name,
        fileTitle: proofFiles.title,
      })
      .from(approvals)
      .innerJoin(clients, eq(clients.id, approvals.clientId))
      .leftJoin(projectPhases, eq(projectPhases.id, approvals.subjectId))
      .leftJoin(proofVersions, eq(proofVersions.id, approvals.subjectId))
      .leftJoin(proofFiles, eq(proofFiles.id, proofVersions.fileId))
      .where(eq(approvals.id, approvalId));
    if (!row) return null;
    const file = row.subjectType === 'file_version';
    const name = file ? row.fileTitle : row.phaseName;
    if (!name) return null;
    return {
      companyName: row.companyName,
      phaseName: name,
      subject: file ? 'file' : 'phase',
      decision: row.status === 'approved' ? 'approved' : 'changes_requested',
      roomUrl: new URL(
        file ? `/c/${row.clientId}/proofs/${row.subjectId}` : `/c/${row.clientId}`,
        deps.appBaseUrl,
      ).toString(),
    };
  });
}
