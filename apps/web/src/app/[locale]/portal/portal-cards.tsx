import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { PortalProposal } from '@/modules/contracts/server';

export type ContractStage = 'to_sign' | 'waiting_studio' | 'signed';

export type ProposalCardState =
  | { kind: 'open' }
  | { kind: 'expired' }
  | { kind: 'contract'; contractId: string; stage: ContractStage };

/** Where the decision maker stands with the proposal and its contract, or null when there is nothing to show. */
export function proposalCardState(proposal: PortalProposal | null): ProposalCardState | null {
  if (!proposal) return null;
  if (proposal.status === 'accepted') {
    if (!proposal.contractId) return null;
    const stage: ContractStage =
      proposal.contractStatus === 'signed'
        ? 'signed'
        : proposal.contractClientSigned
          ? 'waiting_studio'
          : 'to_sign';
    return { kind: 'contract', contractId: proposal.contractId, stage };
  }
  return proposal.expired ? { kind: 'expired' } : { kind: 'open' };
}

const CARD = 'flex flex-col gap-2 rounded-lg border-2 border-text bg-surface p-4';
const LINK = 'text-body-sm text-link hover:underline';

export function ProposalHomeCard({ state }: { state: ProposalCardState }) {
  const t = useTranslations('portal');

  if (state.kind === 'contract') {
    const body =
      state.stage === 'signed'
        ? t('contract.homeSigned')
        : state.stage === 'waiting_studio'
          ? t('contract.waitingStudio')
          : t('contract.homeSign');
    return (
      <section aria-labelledby="portal-contract" className={CARD}>
        <h2 id="portal-contract" className="text-title-sm text-text">
          {t('contract.homeTitle')}
        </h2>
        <p className="text-body-sm text-text-secondary">{body}</p>
        <Link href={`/portal/contracts/${state.contractId}`} className={LINK}>
          {t('contract.homeOpen')}
        </Link>
      </section>
    );
  }

  if (state.kind === 'expired') {
    return (
      <section aria-labelledby="portal-proposal" className={CARD}>
        <h2 id="portal-proposal" className="text-title-sm text-text">
          {t('home.proposalExpiredTitle')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('home.proposalExpiredBody')}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="portal-proposal" className={CARD}>
      <h2 id="portal-proposal" className="text-title-sm text-text">
        {t('home.proposalTitle')}
      </h2>
      <p className="text-body-sm text-text-secondary">{t('home.proposalBody')}</p>
      <Link href="/portal/proposal" className={LINK}>
        {t('home.proposalOpen')}
      </Link>
    </section>
  );
}
