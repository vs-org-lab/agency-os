import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { approvals, clients, projectPhases, projects, proofFiles, proofVersions } = schema;

export type ApprovalNotice = {
  companyName: string;
  /** The phase name, the file title or, for the final approval, the project name. */
  phaseName: string;
  subject: 'phase' | 'file' | 'delivery';
  decision: 'approved' | 'changes_requested';
  roomUrl: string;
};

/** The client, the phase, file or project and the room link that approval alerts mention. */
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
        projectName: projects.name,
      })
      .from(approvals)
      .innerJoin(clients, eq(clients.id, approvals.clientId))
      .leftJoin(projectPhases, eq(projectPhases.id, approvals.subjectId))
      .leftJoin(proofVersions, eq(proofVersions.id, approvals.subjectId))
      .leftJoin(proofFiles, eq(proofFiles.id, proofVersions.fileId))
      .leftJoin(projects, eq(projects.id, approvals.subjectId))
      .where(eq(approvals.id, approvalId));
    if (!row) return null;
    const file = row.subjectType === 'file_version';
    const subject = file ? 'file' : row.subjectType === 'project' ? 'delivery' : 'phase';
    const name = { file: row.fileTitle, delivery: row.projectName, phase: row.phaseName }[subject];
    if (!name) return null;
    return {
      companyName: row.companyName,
      phaseName: name,
      subject,
      decision: row.status === 'approved' ? 'approved' : 'changes_requested',
      roomUrl: new URL(
        file ? `/c/${row.clientId}/proofs/${row.subjectId}` : `/c/${row.clientId}`,
        deps.appBaseUrl,
      ).toString(),
    };
  });
}
