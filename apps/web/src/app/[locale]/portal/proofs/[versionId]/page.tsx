import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { DecisionPanel } from '@/components/proofing/decision-panel';
import { ProofViewer } from '@/components/proofing/proof-viewer';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadClientProofVersion } from '@/modules/proofing/server';
import { portalRoomAccess } from '../../room-session';
import { commentOnClientProofAction, decideProofAction } from '../actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; versionId: string }> };

/** P-03 for a file: the client reads, comments on spots and, as decision maker, decides. */
export default async function PortalProofPage({ params }: PageProps) {
  const { locale: requested, versionId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  if (!access.readsRoom) notFound();
  const version = await loadClientProofVersion(session.claims, versionId);
  if (!version) notFound();
  const t = await getTranslations('proofing');
  const pending = version.approval?.status === 'pending' ? version.approval : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/portal/proofs" className="text-body-sm text-link hover:underline">
          {t('clientList.title')}
        </Link>
        <h1 className="text-title text-text">{version.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <span>{t('section.version', { number: version.number })}</span>
          <Badge variant="secondary">
            {t(`status.${version.approval?.status ?? 'noRequest'}`)}
          </Badge>
        </p>
      </header>
      {pending && access.decides ? (
        <DecisionPanel approvalId={pending.id} rounds={version.rounds} decide={decideProofAction} />
      ) : null}
      <ProofViewer
        kind={version.kind}
        src={`/api/proofs/${versionId}/file`}
        title={version.title}
        number={version.number}
        pages={version.pages}
        previousVersion={version.previousVersion}
        comments={version.comments}
        audience="client"
        canComment
        addComment={commentOnClientProofAction.bind(null, versionId)}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'proofing.clientList.title');
}
