import type { ProjectDocumentStatus } from '@agency-os/db';

export type DocumentActions = {
  share: boolean;
  withdraw: boolean;
  remove: boolean;
  requestApproval: boolean;
};

/**
 * What the team may do with a document in its state: share a draft; withdraw only before the
 * approval (RN-21); remove only what was never approved (RN-20); ask for approval of a shared
 * document without a pending request.
 */
export function documentActions(input: {
  status: ProjectDocumentStatus;
  everApproved: boolean;
  pendingApproval: boolean;
}): DocumentActions {
  return {
    share: input.status === 'draft',
    withdraw: input.status === 'with_client',
    remove: !input.everApproved,
    requestApproval: input.status === 'with_client' && !input.pendingApproval,
  };
}

/** A new version of an approved document goes back to draft; the approved one stays in history. */
export function statusAfterNewVersion(status: ProjectDocumentStatus): ProjectDocumentStatus {
  return status === 'approved' ? 'draft' : status;
}
