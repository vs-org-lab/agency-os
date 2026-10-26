import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { ClientProofList } from '@/components/proofing/client-proof-list';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientProofs } from '@/modules/proofing/server';
import { portalRoomAccess } from '../room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

/** Every proof sent to the client, so decided ones stay reachable for reading and replies. */
export default async function PortalProofsPage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  const proofs = access.readsRoom ? await loadClientProofs(session.claims) : [];
  const t = await getTranslations('proofing.clientList');

  if (proofs.length === 0) {
    return <EmptyState title={t('title')} description={t('empty')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body-sm text-text-secondary">{t('description')}</p>
      </header>
      <ClientProofList proofs={proofs} />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'proofing.clientList.title');
}
