import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalProposal } from '@/modules/contracts/server';
import { acceptProposalAction, requestChangesAction } from './actions';
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

  if (proposal.status === 'accepted') {
    const chosen = proposal.options.find((option) => option.id === proposal.acceptedOptionId);
    return (
      <section className="mx-auto flex w-full max-w-180 flex-col gap-3 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-title text-text">{t('acceptedTitle')}</h1>
        <p className="text-body text-text-secondary">
          {t('acceptedBody', { option: chosen?.name ?? '' })}
        </p>
        {proposal.contractId ? (
          <Link
            href={`/portal/contracts/${proposal.contractId}`}
            className="text-body text-link hover:underline"
          >
            {t('openContract')}
          </Link>
        ) : null}
      </section>
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
