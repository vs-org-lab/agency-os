import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { approvals, clients, projectPhases } = schema;

export type ApprovalNotice = {
  companyName: string;
  phaseName: string;
  decision: 'approved' | 'changes_requested';
  roomUrl: string;
};

/** The client, the phase and the room link that approval alerts to the team mention. */
export async function approvalNotice(
  approvalId: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; appBaseUrl: string },
): Promise<ApprovalNotice | null> {
  return deps.contexts.withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        clientId: approvals.clientId,
        status: approvals.status,
        companyName: clients.name,
        phaseName: projectPhases.name,
      })
      .from(approvals)
      .innerJoin(clients, eq(clients.id, approvals.clientId))
      .innerJoin(projectPhases, eq(projectPhases.id, approvals.subjectId))
      .where(eq(approvals.id, approvalId));
    if (!row) return null;
    return {
      companyName: row.companyName,
      phaseName: row.phaseName,
      decision: row.status === 'approved' ? 'approved' : 'changes_requested',
      roomUrl: new URL(`/c/${row.clientId}`, deps.appBaseUrl).toString(),
    };
  });
}
