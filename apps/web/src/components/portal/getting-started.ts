import type { PortalProposal } from '@/modules/contracts/server';

export type GettingStartedId = 'tour' | 'proposal' | 'contract' | 'payment' | 'onboarding' | 'team';

export type GettingStartedStep = {
  id: GettingStartedId;
  done: boolean;
  /** Where the step is done; the tour starts in place instead. */
  href: string | null;
};

export type GettingStartedSources = {
  toured: boolean;
  decides: boolean;
  pays: boolean;
  proposal: Pick<
    PortalProposal,
    'status' | 'contractId' | 'contractStatus' | 'contractClientSigned'
  > | null;
  invoices: ReadonlyArray<{ status: 'sent' | 'paid' }>;
  /** The onboarding requests of the briefing and how many are done; null without any. */
  onboarding?: { done: number; total: number } | null;
  /** Client users with access, the reader included; null when the reader cannot list them. */
  colleagues: number | null;
};

/**
 * The client's first steps in the portal, in the order the engagement asks for them. Only the
 * steps that apply to this reader are listed: the commercial ones exist once there is a proposal,
 * the payment once a request was sent to someone who pays, the team for the decision maker.
 */
export function gettingStartedSteps(sources: GettingStartedSources): GettingStartedStep[] {
  const steps: GettingStartedStep[] = [{ id: 'tour', done: sources.toured, href: null }];
  const proposal = sources.proposal;

  if (proposal) {
    steps.push({ id: 'proposal', done: proposal.status === 'accepted', href: '/portal/proposal' });
    if (proposal.status === 'accepted' && proposal.contractId) {
      steps.push({
        id: 'contract',
        done: proposal.contractClientSigned || proposal.contractStatus === 'signed',
        href: `/portal/contracts/${proposal.contractId}`,
      });
    }
  }
  if (sources.pays && sources.invoices.length > 0) {
    steps.push({
      id: 'payment',
      done: sources.invoices.some((invoice) => invoice.status === 'paid'),
      href: '/portal/invoices',
    });
  }
  if (sources.onboarding && sources.onboarding.total > 0) {
    steps.push({
      id: 'onboarding',
      done: sources.onboarding.done >= sources.onboarding.total,
      href: '/portal/onboarding',
    });
  }
  if (sources.decides && sources.colleagues !== null) {
    steps.push({ id: 'team', done: sources.colleagues > 1, href: '/portal/settings/team' });
  }
  return steps;
}
