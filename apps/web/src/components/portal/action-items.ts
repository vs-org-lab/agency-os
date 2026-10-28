import type { PortalInvoice } from '@/modules/billing';
import type { PortalProposal } from '@/modules/contracts/server';
import type { ClientPendingApproval } from '@/modules/rooms';
import type { PortalActionItem } from './action-list';

export type ActionItemSources = {
  /** Only the decision maker decides approvals and proofs, so only they are asked to act. */
  decides: boolean;
  approvals: ClientPendingApproval[];
  proposal: PortalProposal | null;
  invoices: Pick<PortalInvoice, 'id' | 'number' | 'label' | 'dueDate' | 'status'>[];
  /** Open onboarding requests, with the line that names them. */
  onboarding?: { open: number; title: string } | null;
};

/** What the existing portal reads ask of the client, as the items of "A sua ação". */
export function portalActionItems(sources: ActionItemSources): PortalActionItem[] {
  const items: PortalActionItem[] = [];

  if (sources.decides) {
    for (const approval of sources.approvals) {
      items.push(
        approval.kind === 'file' && approval.versionId
          ? {
              kind: 'proof',
              title: approval.subjectName,
              dueOn: null,
              href: `/portal/proofs/${approval.versionId}`,
            }
          : {
              kind: 'approval',
              title: approval.subjectName,
              dueOn: null,
              href: '/portal/approvals',
            },
      );
    }
  }

  const proposal = sources.proposal;
  if (proposal && !proposal.expired && proposal.status === 'sent') {
    items.push({
      kind: 'proposal',
      title: proposal.entityName,
      dueOn: proposal.validUntil,
      href: '/portal/proposal',
    });
  }
  if (
    proposal?.status === 'accepted' &&
    proposal.contractId &&
    proposal.contractStatus === 'awaiting_signatures' &&
    !proposal.contractClientSigned
  ) {
    items.push({
      kind: 'contract',
      title: proposal.entityName,
      dueOn: null,
      href: `/portal/contracts/${proposal.contractId}`,
    });
  }

  for (const invoice of sources.invoices) {
    if (invoice.status !== 'sent') continue;
    items.push({
      kind: 'payment',
      title: `${invoice.number} · ${invoice.label}`,
      dueOn: invoice.dueDate,
      href: '/portal/invoices',
    });
  }

  if (sources.onboarding && sources.onboarding.open > 0) {
    items.push({
      kind: 'onboarding',
      title: sources.onboarding.title,
      dueOn: null,
      href: '/portal/onboarding',
    });
  }

  return items;
}
