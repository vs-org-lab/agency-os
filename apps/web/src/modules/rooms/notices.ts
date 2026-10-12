import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const {
  approvals,
  clients,
  projectDocuments,
  projectDocumentVersions,
  projectPhases,
  projects,
  proofFiles,
  proofVersions,
} = schema;

export type ApprovalNotice = {
  companyName: string;
  /** The phase name, the file title or, for the final approval, the project name. */
  phaseName: string;
  subject: 'phase' | 'file' | 'delivery' | 'document' | 'brand_hub';
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
        documentId: projectDocuments.id,
        documentTitle: projectDocuments.title,
      })
      .from(approvals)
      .innerJoin(clients, eq(clients.id, approvals.clientId))
      .leftJoin(projectPhases, eq(projectPhases.id, approvals.subjectId))
      .leftJoin(proofVersions, eq(proofVersions.id, approvals.subjectId))
      .leftJoin(proofFiles, eq(proofFiles.id, proofVersions.fileId))
      .leftJoin(projects, eq(projects.id, approvals.subjectId))
      .leftJoin(projectDocumentVersions, eq(projectDocumentVersions.id, approvals.subjectId))
      .leftJoin(projectDocuments, eq(projectDocuments.id, projectDocumentVersions.documentId))
      .where(eq(approvals.id, approvalId));
    if (!row) return null;
    const file = row.subjectType === 'file_version';
    const subject = file
      ? 'file'
      : row.subjectType === 'project'
        ? 'delivery'
        : row.subjectType === 'document_version'
          ? 'document'
          : row.subjectType === 'brand_hub_publication'
            ? 'brand_hub'
            : 'phase';
    const name = {
      file: row.fileTitle,
      delivery: row.projectName,
      phase: row.phaseName,
      document: row.documentTitle,
      brand_hub: 'Brand Hub',
    }[subject];
    if (!name) return null;
    return {
      companyName: row.companyName,
      phaseName: name,
      subject,
      decision: row.status === 'approved' ? 'approved' : 'changes_requested',
      roomUrl: new URL(
        file
          ? `/c/${row.clientId}/proofs/${row.subjectId}`
          : subject === 'document'
            ? `/c/${row.clientId}/docs/${row.documentId}`
            : subject === 'brand_hub'
              ? `/c/${row.clientId}/hub`
              : `/c/${row.clientId}`,
        deps.appBaseUrl,
      ).toString(),
    };
  });
}
