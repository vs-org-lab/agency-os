import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { ProofViewer } from '@/components/proofing/proof-viewer';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadStaffProofVersion } from '@/modules/proofing/server';
import { commentOnProofAction, resolveProofCommentAction } from '../../proof-actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string; versionId: string }> };

/** The room team's view of a file version, with every comment including internal ones. */
export default async function StaffProofPage({ params }: PageProps) {
  const { locale: requested, clientId, versionId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const version = await loadStaffProofVersion(session.claims, versionId);
  if (!version || version.clientId !== clientId) notFound();
  const t = await getTranslations('proofing');
  const commentOnVersion = commentOnProofAction.bind(null, versionId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={`/c/${clientId}`} className="text-body-sm text-link hover:underline">
          {t('section.title')}
        </Link>
        <h1 className="text-title text-text">{version.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <span>{t('section.version', { number: version.number })}</span>
          <Badge variant="secondary">
            {t(`status.${version.approval?.status ?? 'noRequest'}`)}
          </Badge>
          <span>
            {t('section.rounds', { used: version.rounds.used, limit: version.rounds.limit })}
          </span>
        </p>
      </header>
      <ProofViewer
        kind={version.kind}
        src={`/api/proofs/${versionId}/file`}
        title={version.title}
        number={version.number}
        pages={version.pages}
        comments={version.comments}
        audience="team"
        canComment
        addComment={commentOnVersion}
        resolveComment={resolveProofCommentAction}
      />
    </div>
  );
}
