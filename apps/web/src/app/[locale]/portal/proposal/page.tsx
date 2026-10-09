import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalProposal } from '@/modules/contracts/server';
import { acceptProposalAction, requestChangesAction } from './actions';
import { ProposalHomeCard, proposalCardState } from '../portal-cards';
import { ProposalAcceptance } from './proposal-acceptance';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function PortalProposalPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const clientId = [...session.ctx.clientRoles.keys()][0];
  const proposal = clientId ? await loadPortalProposal(session.claims, clientId) : null;
  const t = await getTranslations('portal.proposal');

  if (!proposal) return <EmptyState title={t('title')} description={t('empty')} />;

  const card = proposalCardState(proposal);
  if (proposal.status === 'accepted' && card) {
    return (
      <div className="mx-auto w-full max-w-180">
        <ProposalHomeCard state={card} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-240">
      <ProposalAcceptance
        proposal={proposal}
        actions={{ accept: acceptProposalAction, requestChanges: requestChangesAction }}
      />
    </div>
  );
}
